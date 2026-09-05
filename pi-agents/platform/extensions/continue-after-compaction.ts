import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const HANDOFF_STATE_EVENT = "brad:handoff-state";

/** Notices only: Pi owns overflow recovery and continuation of active runs. */
export default function compactionCheckpoint(pi: ExtensionAPI): void {
  let handoffInProgress = false;

  const unsubscribeFromHandoff = pi.events.on(HANDOFF_STATE_EVENT, (active) => {
    if (typeof active === "boolean") handoffInProgress = active;
  });

  pi.on("session_compact", (event, ctx) => {
    if (event.willRetry || handoffInProgress || !ctx.hasUI) return;

    const commands = pi.getCommands()
      .filter(({ name }) => name === "close" || name === "handoff")
      .map(({ name }) => `/${name}`);
    const commandHint = commands.length > 0
      ? ` Available checkpoints: ${commands.join(" or ")}.`
      : "";

    ctx.ui.notify(
      `Compaction complete (${event.reason}). No extra continuation queued. At the next stopping point, review completed work and choose whether to stop or continue.${commandHint}`,
      "info",
    );
  });

  pi.on("session_shutdown", () => {
    unsubscribeFromHandoff();
  });
}
