import {
  isToolCallEventType,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

import { assessSshCommand } from "../lib/ssh-policy.ts";

export default function registerProxmoxSshGate(pi: ExtensionAPI): void {
  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const command = event.input.command;
    const assessment = assessSshCommand(command);
    if (assessment === "unrelated" || assessment === "read-only") return;

    if (assessment === "sensitive") {
      return {
        block: true,
        reason: "Blocked SSH command mentioning sensitive material",
        terminate: true,
      };
    }

    if (!ctx.hasUI) {
      return {
        block: true,
        reason: "SSH command is not recognized as read-only and requires interactive approval",
      };
    }

    // Show the entire local command: wrappers and SSH options can also mutate state.
    const choice = await ctx.ui.select(
      `Approve this SSH command once?\n\n${command}`,
      ["Allow once", "Deny"],
    );

    if (choice !== "Allow once") {
      return { block: true, reason: "SSH command was not approved" };
    }
  });
}
