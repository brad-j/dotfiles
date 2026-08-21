import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const HANDOFF_STATE_EVENT = "brad:handoff-state";

const buildContinuationPrompt = (
  sessionFile: string | undefined,
  compactionEntryId: string,
  reason: "manual" | "threshold" | "overflow",
): string => {
  const historyFallback =
    sessionFile === undefined
      ? "This session is ephemeral, so no persisted history is available as a fallback."
      : `Only if the compacted context is genuinely insufficient or ambiguous, inspect the active branch of ${JSON.stringify(sessionFile)} near compaction entry ${JSON.stringify(compactionEntryId)}. Follow parentId links, inspect only the minimum relevant entries, and do not dump the full session or expose secrets. Do not launch a nested Pi process or use \`pi --session\`.`;

  return `Compaction has completed (${reason}). Resume the existing task rather than waiting for another user prompt.

Use the compaction summary and retained recent messages as the primary context. Reconstruct the original goal, user constraints, decisions, files changed, validation already run, unresolved issues, and intended next action. Treat the current worktree as authoritative for file state and the recovered context as authoritative for user intent.

${historyFallback}

Briefly state the context you recovered, then immediately perform the next unfinished step. Do not stop after the recap, ask the user to repeat available context, or redo completed work. If the requested task is already fully complete, say so concisely and stop.`;
};

/**
 * Resumes unfinished work after successful compaction without eagerly rereading
 * the persisted session. Overflow compactions that Pi will retry automatically
 * are skipped to avoid duplicating the interrupted turn.
 */
export default function continueAfterCompaction(pi: ExtensionAPI): void {
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();
  let handoffInProgress = false;

  const clearPendingTimers = (): void => {
    for (const timer of pendingTimers) clearTimeout(timer);
    pendingTimers.clear();
  };

  const unsubscribeFromHandoff = pi.events.on(HANDOFF_STATE_EVENT, (active) => {
    if (typeof active !== "boolean") return;
    handoffInProgress = active;
    if (active) clearPendingTimers();
  });

  pi.on("session_compact", (event, ctx) => {
    if (event.willRetry || handoffInProgress) return;

    const prompt = buildContinuationPrompt(
      ctx.sessionManager.getSessionFile(),
      event.compactionEntry.id,
      event.reason,
    );

    const timer = setTimeout(() => {
      pendingTimers.delete(timer);
      if (handoffInProgress) return;
      pi.sendUserMessage(prompt, { deliverAs: "followUp" });
    }, 0);

    pendingTimers.add(timer);
  });

  pi.on("session_shutdown", () => {
    clearPendingTimers();
    unsubscribeFromHandoff();
  });
}
