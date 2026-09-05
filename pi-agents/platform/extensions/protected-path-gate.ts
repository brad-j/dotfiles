import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { classifyProtectedPath, matchProtectedCommand } from "../lib/protected-paths.ts";
import { inspectProtectedSearch } from "../lib/protected-search.ts";

const FILE_TOOLS = new Set(["read", "write", "edit", "grep", "find", "ls", "see"]);
const DEFAULT_CWD_TOOLS = new Set(["grep", "find", "ls"]);

function blocked(operation: string, target: string, kind: string, detail?: string) {
  return {
    block: true as const,
    reason: `Protected-path gate blocked ${operation} target ${JSON.stringify(target)} (rule: ${kind})${detail ? `. ${detail}` : ""}`,
    terminate: true,
  };
}

/** Best-effort model-tool protection; arbitrary shell/extension I/O is not confined. */
export default function registerProtectedPathGate(pi: ExtensionAPI): void {
  pi.on("tool_call", async (event, ctx) => {
    const input = event.input as { path?: unknown; command?: unknown };
    if (FILE_TOOLS.has(event.toolName)) {
      const path = DEFAULT_CWD_TOOLS.has(event.toolName) && (input.path === undefined || input.path === "")
        ? "."
        : input.path;
      if (typeof path !== "string" || !path.trim()) {
        return blocked(event.toolName, "(invalid path)", "cannot inspect target");
      }

      if (event.toolName === "grep") {
        const match = await inspectProtectedSearch(path, ctx.cwd, { signal: ctx.signal });
        if (match) {
          return blocked("grep", match.target, match.kind,
            `${match.detail ? `${match.detail}. ` : ""}Use an explicit safe file or a narrower directory; glob filters do not bypass this check.`);
        }
        return;
      }

      try {
        const kind = classifyProtectedPath(path, ctx.cwd);
        if (kind) return blocked(event.toolName, path, kind);
      } catch {
        return blocked(event.toolName, path, "cannot resolve target");
      }
    }

    if (event.toolName === "bash" || event.toolName === "powershell") {
      if (typeof input.command !== "string") {
        return blocked(event.toolName, "(invalid command)", "cannot inspect command");
      }
      const command = event.toolName === "powershell" ? input.command.replaceAll("\\", "/") : input.command;
      const match = matchProtectedCommand(command, ctx.cwd);
      if (match) return blocked(event.toolName, match.target, match.kind);
    }
  });
}
