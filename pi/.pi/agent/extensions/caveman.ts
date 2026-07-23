import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";

const DEFAULT_LEVEL = process.env.PI_CAVEMAN_MODE ?? "full";
const VALID_LEVELS = new Set(["lite", "full", "ultra"]);

const CAVEMAN_PROMPT = `
Caveman compression: answer terse, technically exact, and useful.
- Remove filler, pleasantries, repetition, and hedging.
- Prefer short sentences or fragments when unambiguous.
- Preserve code, commands, paths, identifiers, URLs, and exact error text byte-for-byte.
- Do not narrate tool calls. Do not dump long logs unless asked; quote decisive lines.
- Use normal prose for security warnings, confirmations, ambiguous multi-step procedures, and code/commits/PRs.
- Never omit a fact that changes correctness. Match the user's language.
- Level: {level}. Use lite for concise professional prose, full for terse fragments, ultra for maximum safe brevity.
`;

let level = DEFAULT_LEVEL;
let cavememAvailable: boolean | undefined;

function runProcess(args: string[], input?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn("cavemem", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 10_000);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: 127 });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

async function runHook(name: string, payload: Record<string, unknown>): Promise<string> {
  const result = await runProcess(["hook", "run", name, "--ide", "pi"], JSON.stringify(payload));
  if (result.code === 127) cavememAvailable = false;
  if (result.code !== 0) return "";
  cavememAvailable = true;
  return result.stdout.trim();
}

function sessionId(ctx: any): string {
  try {
    return ctx.sessionManager.getSessionId?.() ?? ctx.sessionManager.getSessionFile?.() ?? "pi-session";
  } catch {
    return "pi-session";
  }
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) return String((part as { text: unknown }).text);
        return JSON.stringify(part);
      })
      .join("\n");
  }
  if (value && typeof value === "object" && "content" in value) {
    return textOf((value as { content: unknown }).content);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? "");
  }
}

function parseSearch(stdout: string): string {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5)
    .join("\n");
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("caveman", {
    description: "Set Caveman response compression: /caveman [lite|full|ultra|off]",
    handler: async (args, ctx) => {
      const requested = args.trim().toLowerCase();
      if (!requested) {
        ctx.ui.notify(`Caveman: ${level === "off" ? "off" : level}`, "info");
        return;
      }
      if (requested === "off" || requested === "normal") {
        level = "off";
        ctx.ui.notify("Caveman compression off", "info");
        return;
      }
      if (!VALID_LEVELS.has(requested)) {
        ctx.ui.notify("Use /caveman [lite|full|ultra|off]", "warning");
        return;
      }
      level = requested;
      ctx.ui.notify(`Caveman compression: ${level}`, "info");
    },
  });

  pi.registerCommand("memory", {
    description: "Search Cavemem: /memory <query>",
    handler: async (args, ctx) => {
      const query = args.trim();
      if (!query) {
        ctx.ui.notify("Usage: /memory <query>", "warning");
        return;
      }
      const result = await runProcess(["search", query, "--limit", "10", "--no-semantic"]);
      const matches = parseSearch(result.stdout);
      ctx.ui.notify(matches || "No matching memories.", matches ? "info" : "warning");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    await runHook("session-start", {
      session_id: sessionId(ctx),
      cwd: ctx.cwd,
      source: "startup",
    });
    if (cavememAvailable === false && ctx.hasUI) {
      ctx.ui.notify("Cavemem unavailable; memory integration disabled", "warning");
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const id = sessionId(ctx);
    await runHook("user-prompt-submit", {
      session_id: id,
      cwd: ctx.cwd,
      prompt: event.prompt,
    });

    let systemPrompt = event.systemPrompt;
    if (level !== "off") {
      systemPrompt += CAVEMAN_PROMPT.replace("{level}", level);
    }

    const search = await runProcess(["search", event.prompt, "--limit", "5", "--no-semantic"]);
    const memories = parseSearch(search.stdout);
    if (memories) {
      systemPrompt += `\n\nRelevant local Cavemem recall (possibly stale; verify before relying on it):\n${memories}`;
    }
    return { systemPrompt };
  });

  pi.on("tool_result", async (event, ctx) => {
    await runHook("post-tool-use", {
      session_id: sessionId(ctx),
      cwd: ctx.cwd,
      tool_name: event.toolName,
      tool_input: event.input,
      tool_response: textOf(event.content),
    });
  });

  pi.on("turn_end", async (event, ctx) => {
    const summary = textOf(event.message);
    if (!summary.trim()) return;
    await runHook("stop", {
      session_id: sessionId(ctx),
      cwd: ctx.cwd,
      last_assistant_message: summary,
      turn_summary: summary,
    });
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    await runHook("session-end", {
      session_id: sessionId(ctx),
      cwd: ctx.cwd,
    });
  });
}
