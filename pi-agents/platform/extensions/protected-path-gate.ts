import {
  isToolCallEventType,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import {
  classifyProtectedCommand,
  classifyProtectedPath,
  type ProtectedPathKind,
} from "../lib/protected-paths.js";

function blocked(kind: ProtectedPathKind) {
  return {
    block: true as const,
    reason: `Blocked LLM access to protected ${kind}`,
    terminate: true,
  };
}

/** Prevents model-initiated tools from reading or changing local secret material. */
export default function registerProtectedPathGate(pi: ExtensionAPI): void {
  pi.on("tool_call", (event, ctx) => {
    if (isToolCallEventType("read", event)) {
      const kind = classifyProtectedPath(event.input.path, ctx.cwd);
      if (kind) return blocked(kind);
    }

    if (isToolCallEventType("write", event)) {
      const kind = classifyProtectedPath(event.input.path, ctx.cwd);
      if (kind) return blocked(kind);
    }

    if (isToolCallEventType("edit", event)) {
      const kind = classifyProtectedPath(event.input.path, ctx.cwd);
      if (kind) return blocked(kind);
    }

    if (isToolCallEventType("bash", event)) {
      const kind = classifyProtectedCommand(event.input.command, ctx.cwd);
      if (kind) return blocked(kind);
    }
  });
}
