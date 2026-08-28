import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, resolve, sep } from "node:path";

export type ProtectedPathKind =
  | "agent authentication"
  | "Cloak configuration"
  | "environment or credential file"
  | "private key material";

const CREDENTIAL_FILES = new Set([
  ".netrc",
  ".npmrc",
  ".pypirc",
  "application_default_credentials.json",
  "credentials",
  "credentials.json",
  "credentials.toml",
  "credentials.yaml",
  "credentials.yml",
  "kubeconfig",
  "secrets.json",
  "secrets.toml",
  "secrets.yaml",
  "secrets.yml",
]);

const PRIVATE_KEY_DIRECTORIES = new Set([
  ".gnupg",
  ".ssh",
  "private-keys",
  "private_keys",
]);

const PRIVATE_KEY_FILES = /^(?:id_(?:dsa|ecdsa|ed25519|rsa)|.+\.(?:key|p12|pfx|pem))$/i;

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith(`~${sep}`)) return resolve(homedir(), path.slice(2));
  return path;
}

function canonicalizeExistingParent(path: string): string | undefined {
  const missingParts: string[] = [];
  let candidate = path;

  while (true) {
    try {
      return resolve(realpathSync.native(candidate), ...missingParts.reverse());
    } catch {
      const parent = dirname(candidate);
      if (parent === candidate) return undefined;
      missingParts.push(basename(candidate));
      candidate = parent;
    }
  }
}

function pathCandidates(path: string, cwd: string): string[] {
  const expanded = expandHome(path);
  const absolute = isAbsolute(expanded) ? resolve(expanded) : resolve(cwd, expanded);
  const canonical = canonicalizeExistingParent(absolute);
  return canonical && canonical !== absolute ? [absolute, canonical] : [absolute];
}

function classifyAbsolutePath(path: string): ProtectedPathKind | undefined {
  const parts = path.split(sep).filter(Boolean);
  const basename = parts.at(-1)?.toLowerCase() ?? "";

  if (basename === "auth.json") return "agent authentication";
  if (basename === "cloak.json") return "Cloak configuration";
  if (basename === ".env" || basename === ".envrc" || basename.startsWith(".env.")) {
    return "environment or credential file";
  }
  if (CREDENTIAL_FILES.has(basename) || basename.startsWith(".credentials.")) {
    return "environment or credential file";
  }
  if (
    parts.some((part) => PRIVATE_KEY_DIRECTORIES.has(part.toLowerCase())) ||
    parts.some((part, index) => part.toLowerCase() === ".pki" && parts[index + 1]?.toLowerCase() === "private") ||
    PRIVATE_KEY_FILES.test(basename)
  ) {
    return "private key material";
  }

  return undefined;
}

export function classifyProtectedPath(path: string, cwd: string): ProtectedPathKind | undefined {
  if (!path.trim()) return undefined;

  for (const candidate of pathCandidates(path, cwd)) {
    const kind = classifyAbsolutePath(candidate);
    if (kind) return kind;
  }

  return undefined;
}

const PROTECTED_COMMAND_PATTERNS: ReadonlyArray<readonly [RegExp, ProtectedPathKind]> = [
  [/(?:^|[\s'"=/:])auth\.json(?:$|[\s'";&|/])/i, "agent authentication"],
  [/(?:^|[\s'"=/:])cloak\.json(?:$|[\s'";&|/])/i, "Cloak configuration"],
  [/(?:^|[\s'"=/:])\.env(?:rc|\.[a-z0-9_.-]+)?(?:$|[\s'";&|/])/i, "environment or credential file"],
  [/(?:^|[\s'"=/:])(?:\.?(?:credentials)(?:\.(?:json|toml|ya?ml))?|application_default_credentials\.json|\.netrc|\.npmrc|\.pypirc|kubeconfig|secrets\.(?:json|toml|ya?ml))(?:$|[\s'";&|/])/i, "environment or credential file"],
  [/(?:^|[\s'"=/:])(?:\.ssh|\.gnupg|private[-_]keys)(?:$|[\s'";&|/])/i, "private key material"],
  [/(?:^|[\s'"=/:])\.pki\/private(?:$|[\s'";&|/])/i, "private key material"],
  [/(?:^|[\s'"=/:])(?:id_(?:dsa|ecdsa|ed25519|rsa)|[^\s'";&|/]+\.(?:key|p12|pfx|pem))(?:$|[\s'";&|/])/i, "private key material"],
];

export function classifyProtectedCommand(command: string, cwd: string): ProtectedPathKind | undefined {
  const cwdKind = classifyProtectedPath(cwd, cwd);
  if (cwdKind) return cwdKind;

  for (const [pattern, kind] of PROTECTED_COMMAND_PATTERNS) {
    if (pattern.test(command)) return kind;
  }

  return undefined;
}
