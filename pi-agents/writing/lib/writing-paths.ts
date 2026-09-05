import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, resolve, sep } from "node:path";

export type WritingMutationViolation =
  | "author-owned material"
  | "outside generated-output directories";

export const GENERATED_DIRECTORIES = ["workbench", "research", "admin", "ideas"] as const;
export const AUTHOR_OWNED_DIRECTORIES = ["manuscript", "source-notes"] as const;

function expandHome(filePath: string): string {
  if (filePath === "~") return homedir();
  if (filePath.startsWith(`~${sep}`)) return resolve(homedir(), filePath.slice(2));
  return filePath;
}

function canonicalizeExistingParent(filePath: string): string | undefined {
  const missingParts: string[] = [];
  let candidate = filePath;

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

function pathCandidates(filePath: string, cwd: string): string[] {
  const expanded = expandHome(filePath);
  const absolute = isAbsolute(expanded) ? resolve(expanded) : resolve(cwd, expanded);
  const canonical = canonicalizeExistingParent(absolute);
  return canonical && canonical !== absolute ? [absolute, canonical] : [absolute];
}

function isWithin(parent: string, candidate: string): boolean {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

function containsDirectory(candidate: string, cwd: string, directories: readonly string[]): boolean {
  if (!isWithin(cwd, candidate)) return false;
  const relativeParts = candidate.slice(cwd.length).split(sep).filter(Boolean);
  return relativeParts.some((part) => directories.includes(part));
}

export function classifyWritingMutation(
  filePath: string,
  cwd: string,
): WritingMutationViolation | undefined {
  if (!filePath.trim()) return "outside generated-output directories";

  const workspaceRoot = resolve(cwd);
  const candidates = pathCandidates(filePath, workspaceRoot);
  if (candidates.some((candidate) => containsDirectory(candidate, workspaceRoot, AUTHOR_OWNED_DIRECTORIES))) {
    return "author-owned material";
  }

  const everyCandidateIsGenerated = candidates.every((candidate) =>
    containsDirectory(candidate, workspaceRoot, GENERATED_DIRECTORIES),
  );

  return everyCandidateIsGenerated ? undefined : "outside generated-output directories";
}
