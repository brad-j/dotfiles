import {
  isToolCallEventType,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

const TARGET_PATTERN = /(?:^|\s)(think-[12]|root@192\.168\.3\.(?:160|148))(?:\s|$)/;

const READ_ONLY_COMMANDS = [
  /^pveversion(?:\s|$)/,
  /^qm\s+(?:list|status|config|showcmd)\b/,
  /^pct\s+(?:list|status|config)\b/,
  /^pvesh\s+get\b/,
  /^journalctl(?:\s|$)/,
  /^systemctl\s+(?:status|is-active|is-enabled|show|list-units|list-timers)\b/,
  /^(?:hostname|id|uname|uptime|free|df|lsblk|lscpu|ps|ss)(?:\s|$)/,
  /^ip\s+(?:address|addr|link|route|rule|neighbour|neighbor)\s+(?:show|list)\b/,
  /^test\s+(?:-[a-zA-Z]+\s+)?[^;&|]+$/,
];

const SENSITIVE_PATHS = [
  /\/etc\/pve\/priv(?:\/|\b)/,
  /\/root\/\.ssh(?:\/|\b)/,
  /(?:^|\s)(?:cat|head|tail|less|more|grep|sed|awk)\b[^\n]*(?:id_ed25519|\.key\b|private[^/\s]*\.pem\b)/i,
];

function remoteCommand(command: string): { target: string; command: string } | undefined {
  if (!/(?:^|[;&|]\s*)ssh\s/.test(command)) return undefined;

  const target = command.match(TARGET_PATTERN);
  if (!target?.[1] || target.index === undefined) return undefined;

  let remote = command.slice(target.index + target[0].length).trim();
  if (
    remote.length >= 2 &&
    ((remote.startsWith("'") && remote.endsWith("'")) ||
      (remote.startsWith('"') && remote.endsWith('"')))
  ) {
    remote = remote.slice(1, -1).trim();
  }

  return { target: target[1], command: remote };
}

function isRecognizedReadOnly(command: string): boolean {
  if (!command || /[;&|`$<>\n]/.test(command)) return false;
  return READ_ONLY_COMMANDS.some((pattern) => pattern.test(command));
}

export default function registerProxmoxSshGate(pi: ExtensionAPI): void {
  let elevatedCommandsApproved = false;

  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const remote = remoteCommand(event.input.command);
    if (!remote) return;

    if (SENSITIVE_PATHS.some((pattern) => pattern.test(remote.command))) {
      return {
        block: true,
        reason: `Blocked access to sensitive material on ${remote.target}`,
        terminate: true,
      };
    }

    if (isRecognizedReadOnly(remote.command) || elevatedCommandsApproved) return;

    if (!ctx.hasUI) {
      return {
        block: true,
        reason: `Remote command on ${remote.target} requires interactive approval`,
      };
    }

    const choice = await ctx.ui.select(
      `Approve remote command on ${remote.target}?\n\n${remote.command || "Open an interactive SSH session"}`,
      ["Allow once", "Allow elevated commands for this session", "Deny"],
    );

    if (choice === "Allow elevated commands for this session") {
      elevatedCommandsApproved = true;
      ctx.ui.notify("Elevated Proxmox commands approved for this session", "warning");
      return;
    }

    if (choice !== "Allow once") {
      return { block: true, reason: `Remote command on ${remote.target} was not approved` };
    }
  });
}
