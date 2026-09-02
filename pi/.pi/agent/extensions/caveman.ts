import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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

  pi.on("before_agent_start", async (event) => {
    if (level === "off") return;
    return {
      systemPrompt: event.systemPrompt + CAVEMAN_PROMPT.replace("{level}", level),
    };
  });
}
