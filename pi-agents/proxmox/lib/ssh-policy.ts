export type SshAssessment = "unrelated" | "read-only" | "approval" | "sensitive";

const TARGETS = new Set(["think-1", "think-2", "root@192.168.3.160", "root@192.168.3.148"]);
const SENSITIVE_PATHS = [
  /\/etc\/pve\/priv(?:\/|\b)/,
  /\/root\/\.ssh(?:\/|\b)/,
  /(?:id_ed25519|\.key\b|private[^/\s]*\.pem\b)/i,
];

/** A deliberately small shell subset, not a general shell parser. */
function simpleWords(command: string): string[] | undefined {
  // Reject expansions, escaping, operators, globbing, and control characters,
  // even inside quotes. A second parse checks the remote shell command too.
  if (/[\x00-\x1f\x7f;&|`$<>\\(){}*?!]/.test(command)) return undefined;

  const words: string[] = [];
  let word = "";
  let quote: string | undefined;
  let started = false;
  for (const char of command.trim()) {
    if (quote) {
      if (char === quote) quote = undefined;
      else word += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (char === " ") {
      if (started) words.push(word);
      word = "";
      started = false;
    } else {
      word += char;
      started = true;
    }
  }
  if (quote) return undefined;
  if (started) words.push(word);
  return words;
}

const UNIT = /^[a-zA-Z0-9_][a-zA-Z0-9_.@:-]*$/;
const POSITIVE_INTEGER = /^[0-9]+$/;
const TIME = /^[a-zA-Z0-9][a-zA-Z0-9 :.+-]*$/;

/** Unknown options and unexpected positional arguments always need approval. */
function allowedOptions(
  args: readonly string[],
  flags: readonly string[],
  values: Readonly<Record<string, RegExp>> = {},
  positional?: RegExp,
): boolean {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (flags.includes(arg)) continue;
    const equals = arg.indexOf("=");
    const name = equals < 0 ? arg : arg.slice(0, equals);
    const pattern = Object.hasOwn(values, name) ? values[name] : undefined;
    if (pattern) {
      const value = equals < 0 ? args[++index] : arg.slice(equals + 1);
      if (value === undefined || !pattern.test(value)) return false;
    } else if (!positional?.test(arg)) {
      return false;
    }
  }
  return true;
}

function isReadOnlyRemote(command: string): boolean {
  const words = simpleWords(command);
  if (!words?.length) return false;
  const [program, ...args] = words;

  if (program === "pveversion") return allowedOptions(args, ["--verbose", "-v"]);
  if (program === "qm" || program === "pct") {
    if (args.length === 1 && args[0] === "list") return true;
    const actions = program === "qm" ? ["status", "config", "showcmd"] : ["status", "config"];
    return args.length === 2 && actions.includes(args[0]!) && POSITIVE_INTEGER.test(args[1]!);
  }
  if (program === "pvesh") {
    return args[0] === "get" && /^\/[a-zA-Z0-9_./-]*$/.test(args[1] ?? "") &&
      allowedOptions(args.slice(2), [], { "--output-format": /^(?:json|json-pretty|yaml|text)$/ });
  }
  if (program === "journalctl") {
    return allowedOptions(args, ["--no-pager", "--quiet", "--utc", "--reverse", "--list-boots", "--disk-usage"], {
      "-u": UNIT,
      "--unit": UNIT,
      "--since": TIME,
      "--until": TIME,
      "-n": POSITIVE_INTEGER,
      "--lines": POSITIVE_INTEGER,
      "-b": /^-?[0-9]+$/,
      "--boot": /^-?[0-9]+$/,
      "-o": /^(?:short|short-iso|json|json-pretty|cat)$/,
      "--output": /^(?:short|short-iso|json|json-pretty|cat)$/,
    });
  }
  if (program === "systemctl") {
    return ["status", "is-active", "is-enabled", "show", "list-units", "list-timers"].includes(args[0] ?? "") &&
      allowedOptions(args.slice(1), ["--no-pager", "--plain", "--all", "--failed"], {}, UNIT);
  }
  if (program === "ip") {
    return args.length === 2 &&
      ["address", "addr", "link", "route", "rule", "neighbour", "neighbor"].includes(args[0]!) &&
      ["show", "list"].includes(args[1]!);
  }

  const inspectionFlags: Readonly<Record<string, readonly string[]>> = {
    hostname: [],
    id: ["-u", "-g", "-G", "-n"],
    uname: ["-a", "-r", "-m"],
    uptime: ["-p", "-s"],
    free: ["-h", "-m", "-g"],
    df: ["-h", "-T", "-hT"],
    lsblk: ["-f", "-J"],
    lscpu: ["-J"],
    ps: ["aux", "-ef"],
    ss: ["-lntup", "-tulpn", "-lntp", "-s"],
  };
  return program !== undefined && Object.hasOwn(inspectionFlags, program) &&
    allowedOptions(args, inspectionFlags[program]!);
}

/**
 * Best-effort protection against accidental SSH mutations, not confinement.
 * Only direct invocations of known targets with vetted arguments bypass review.
 * Wrappers, compound commands, other targets and unknown options need approval.
 * Arbitrary scripts, computed executable names, and alternate clients remain
 * outside this text-based gate; use OS isolation for a hard security boundary.
 */
export function assessSshCommand(command: string): SshAssessment {
  // Normalize simple quoting/escaping for detection, not for authorization.
  // False positives are preferable to silently skipping a wrapped SSH call.
  const detectionText = command.replace(/['"\\]/g, "");
  if (!/\b(?:ssh|scp|sftp)\b/.test(detectionText)) return "unrelated";
  if (SENSITIVE_PATHS.some((pattern) => pattern.test(detectionText))) return "sensitive";

  const words = simpleWords(command);
  if (!words || !["ssh", "/usr/bin/ssh"].includes(words[0] ?? "")) return "approval";

  let index = 1;
  while (words[index] === "-o") {
    const option = words[index + 1] ?? "";
    if (!/^(?:BatchMode=yes|ConnectTimeout=[0-9]+)$/.test(option)) return "approval";
    index += 2;
  }
  if (!TARGETS.has(words[index] ?? "")) return "approval";

  // ssh joins command arguments with spaces before passing them to the remote shell.
  const remote = words.slice(index + 1).join(" ");
  return isReadOnlyRemote(remote) ? "read-only" : "approval";
}
