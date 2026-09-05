import {
  isToolCallEventType,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { classifyWritingMutation } from "../lib/writing-paths.js";

function blocked(operation: string, target: string, reason: string) {
  return {
    block: true as const,
    reason: `Writing boundary blocked ${operation} target ${JSON.stringify(target)} (rule: ${reason})`,
    terminate: true,
  };
}

/** Restricts model-initiated mutations to generated writing-workspace directories. */
export default function registerWritingBoundaryGate(pi: ExtensionAPI): void {
  pi.on("session_start", () => {
    pi.setActiveTools(pi.getActiveTools().filter((name) => name !== "bash" && name !== "powershell"));
  });

  pi.on("tool_call", (event, ctx) => {
    if (isToolCallEventType("write", event)) {
      const violation = classifyWritingMutation(event.input.path, ctx.cwd);
      if (violation) return blocked("write", event.input.path, violation);
    }

    if (isToolCallEventType("edit", event)) {
      const violation = classifyWritingMutation(event.input.path, ctx.cwd);
      if (violation) return blocked("edit", event.input.path, violation);
    }

    if (event.toolName === "bash" || event.toolName === "powershell") {
      return blocked(event.toolName, "all commands", "model shell access is disabled");
    }
  });
}
