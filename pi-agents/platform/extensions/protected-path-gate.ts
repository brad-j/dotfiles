import {
  isToolCallEventType,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import {
  classifyProtectedPath,
  matchProtectedCommand,
  type ProtectedPathKind,
} from "../lib/protected-paths.js";

function blocked(operation: string, target: string, kind: ProtectedPathKind) {
  return {
    block: true as const,
    reason: `Protected-path gate blocked ${operation} target ${JSON.stringify(target)} (rule: ${kind})`,
    terminate: true,
  };
}

/** Prevents model-initiated tools from reading or changing local secret material. */
export default function registerProtectedPathGate(pi: ExtensionAPI): void {
  pi.on("tool_call", (event, ctx) => {
    if (isToolCallEventType("read", event)) {
      const kind = classifyProtectedPath(event.input.path, ctx.cwd);
      if (kind) return blocked("read", event.input.path, kind);
    }

    if (isToolCallEventType("write", event)) {
      const kind = classifyProtectedPath(event.input.path, ctx.cwd);
      if (kind) return blocked("write", event.input.path, kind);
    }

    if (isToolCallEventType("edit", event)) {
      const kind = classifyProtectedPath(event.input.path, ctx.cwd);
      if (kind) return blocked("edit", event.input.path, kind);
    }

    if (isToolCallEventType("bash", event)) {
      const match = matchProtectedCommand(event.input.command, ctx.cwd);
      if (match) return blocked("bash", match.target, match.kind);
    }
  });
}
