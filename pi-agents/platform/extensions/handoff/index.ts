import {
  chmodSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import {
  getAgentDir,
  type ExtensionAPI,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";

const AGENT_START_TIMEOUT_MS = 30_000;
const HANDOFF_STATE_EVENT = "brad:handoff-state";
const REMINDER_ENTRY_TYPE = "brad:handoff-reminder";
const REMINDER_THRESHOLD_PERCENT = 70;

function findFirstUserMessageEntryId(entries: readonly SessionEntry[]): string | undefined {
  for (const entry of entries) {
    if (entry.type === "message" && entry.message.role === "user") {
      return entry.id;
    }
  }
  return undefined;
}

function latestCompactionCycle(entries: readonly SessionEntry[]): string {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type === "compaction") return entry.id;
  }
  return "before-first-compaction";
}

function hasReminderForCycle(entries: readonly SessionEntry[], cycle: string): boolean {
  return entries.some((entry) => {
    if (entry.type !== "custom" || entry.customType !== REMINDER_ENTRY_TYPE) return false;
    if (!entry.data || typeof entry.data !== "object") return false;
    return (entry.data as { cycle?: unknown }).cycle === cycle;
  });
}

function createHandoffPath(): string {
  const directory = join(getAgentDir(), "handoffs");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return join(directory, `handoff-${timestamp}.md`);
}

function buildSkillCommand(handoffPath: string, focus: string): string {
  const focusInstruction = focus
    ? ` Tailor it to this next-phase focus: ${JSON.stringify(focus)}.`
    : "";

  return `/skill:handoff Write the handoff document to exactly ${JSON.stringify(handoffPath)}.${focusInstruction}`;
}

function buildBranchSummaryInstructions(handoffPath: string, focus: string): string {
  const focusInstruction = focus
    ? ` Orient the next turn toward this focus: ${focus}`
    : "";

  return `The source branch produced a handoff document at ${JSON.stringify(handoffPath)}. Include that exact absolute path. Keep the document as the detailed source of truth and use this branch summary only for concise orientation.${focusInstruction}`;
}

function buildContinuationPrompt(
  handoffPath: string,
  sessionFile: string | undefined,
  sourceLeafEntryId: string,
): string {
  const fallback = sessionFile
    ? `Only if the handoff and branch summary contain a blocking ambiguity, inspect the minimum relevant active-branch entries near ${JSON.stringify(sourceLeafEntryId)} in ${JSON.stringify(sessionFile)} by following parentId links. Do not dump the full session, expose secrets, launch nested Pi, or use \`pi --session\`.`
    : "This session is ephemeral, so no persisted session history is available as a fallback.";

  return `Open the handoff document at ${JSON.stringify(handoffPath)} and resume the work by performing its next unfinished step. Treat the current worktree as authoritative for file state and the handoff as authoritative for intent and progress.

${fallback}

Do not redo completed work. If the requested task is already complete, say so concisely and stop.`;
}

/** Adds /handoff plus a non-automated context-usage reminder. */
export default function registerHandoff(pi: ExtensionAPI): void {
  type AgentStartWaiter = {
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  };

  const agentStartWaiters = new Set<AgentStartWaiter>();
  let handoffInProgress = false;

  const setHandoffInProgress = (active: boolean): void => {
    handoffInProgress = active;
    pi.events.emit(HANDOFF_STATE_EVENT, active);
  };

  pi.on("agent_start", () => {
    for (const waiter of agentStartWaiters) {
      clearTimeout(waiter.timer);
      waiter.resolve();
    }
    agentStartWaiters.clear();
  });

  const waitForNextAgentStart = (): Promise<void> =>
    new Promise((resolve, reject) => {
      let waiter: AgentStartWaiter;
      const timer = setTimeout(() => {
        agentStartWaiters.delete(waiter);
        reject(new Error("Handoff agent turn did not start within 30 seconds"));
      }, AGENT_START_TIMEOUT_MS);

      waiter = { resolve, reject, timer };
      agentStartWaiters.add(waiter);
    });

  pi.on("agent_settled", (_event, ctx) => {
    if (handoffInProgress || !ctx.hasUI) return;

    const usage = ctx.getContextUsage();
    if (usage?.percent === null || usage?.percent === undefined) return;
    if (usage.percent < REMINDER_THRESHOLD_PERCENT) return;

    const branch = ctx.sessionManager.getBranch();
    const cycle = latestCompactionCycle(branch);
    if (hasReminderForCycle(branch, cycle)) return;

    pi.appendEntry(REMINDER_ENTRY_TYPE, {
      cycle,
      percent: usage.percent,
      timestamp: Date.now(),
    });
    ctx.ui.notify(
      `Context is at ${Math.round(usage.percent)}%. Consider /handoff at the next natural phase boundary.`,
      "info",
    );
  });

  pi.registerCommand("handoff", {
    description: "Write a durable handoff, summarize back to the first message, and continue",
    handler: async (args, ctx) => {
      if (handoffInProgress) {
        ctx.ui.notify("A handoff is already in progress", "warning");
        return;
      }

      setHandoffInProgress(true);

      try {
        await ctx.waitForIdle();

        if (!ctx.model) {
          ctx.ui.notify("Handoff requires a selected model", "error");
          return;
        }

        const providerAuth = await ctx.modelRegistry.getProviderAuth(ctx.model.provider);
        if (!providerAuth) {
          ctx.ui.notify("Handoff requires authentication for the selected model", "error");
          return;
        }

        const firstUserMessageEntryId = findFirstUserMessageEntryId(ctx.sessionManager.getBranch());
        if (!firstUserMessageEntryId) {
          ctx.ui.notify("There is no conversation to hand off", "warning");
          return;
        }

        const focus = args.trim();
        const handoffPath = createHandoffPath();
        const agentStarted = waitForNextAgentStart();

        pi.sendUserMessage(buildSkillCommand(handoffPath, focus), {
          expandPromptTemplates: true,
        });

        await agentStarted;
        await ctx.waitForIdle();

        if (!existsSync(handoffPath)) {
          throw new Error(`The handoff skill did not create ${handoffPath}`);
        }
        chmodSync(handoffPath, 0o600);

        const sourceLeafEntryId = ctx.sessionManager.getLeafId();
        if (!sourceLeafEntryId) {
          throw new Error("Handoff source branch has no leaf entry");
        }

        const sessionFile = ctx.sessionManager.getSessionFile();
        const navigation = await ctx.navigateTree(firstUserMessageEntryId, {
          summarize: true,
          customInstructions: buildBranchSummaryInstructions(handoffPath, focus),
        });
        if (navigation.cancelled) {
          ctx.ui.notify("Handoff tree navigation was cancelled", "warning");
          return;
        }

        const cycle = latestCompactionCycle(ctx.sessionManager.getBranch());
        pi.appendEntry(REMINDER_ENTRY_TYPE, {
          cycle,
          percent: null,
          timestamp: Date.now(),
          reason: "handoff-completed",
        });

        ctx.ui.setEditorText("");
        pi.sendUserMessage(buildContinuationPrompt(handoffPath, sessionFile, sourceLeafEntryId));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Handoff failed: ${message}`, "error");
      } finally {
        setHandoffInProgress(false);
      }
    },
  });

  pi.on("session_shutdown", () => {
    for (const waiter of agentStartWaiters) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("Session ended before the handoff turn started"));
    }
    agentStartWaiters.clear();
    setHandoffInProgress(false);
  });
}
