import { opendir, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { classifyProtectedPath, resolveProtectedToolPath, type ProtectedPathKind } from "./protected-paths.ts";

export type SearchBlock = {
  kind: ProtectedPathKind | "search preflight incomplete";
  target: string;
  detail?: string;
};

/**
 * Preflight directory grep without reading file contents. Deliberately ignores
 * glob/.gitignore filters: those are not a security boundary. Block the whole
 * search if protected descendants exist or the bounded check cannot finish.
 * This cannot prevent files changing between preflight and tool execution.
 */
export async function inspectProtectedSearch(
  path: string,
  cwd: string,
  options: { signal?: AbortSignal; maxEntries?: number; maxDepth?: number } = {},
): Promise<SearchBlock | undefined> {
  const { signal, maxEntries = 10_000, maxDepth = 64 } = options;
  const visited = new Set<string>();
  let entries = 0;

  const incomplete = (target: string, detail: string): SearchBlock => ({
    kind: "search preflight incomplete",
    target,
    detail,
  });

  async function inspect(target: string, depth: number): Promise<SearchBlock | undefined> {
    if (signal?.aborted) return incomplete(target, "cancelled");
    if (++entries > maxEntries) return incomplete(target, "entry limit exceeded");

    try {
      const kind = classifyProtectedPath(target, cwd);
      if (kind) return { kind, target };

      const info = await stat(target);
      if (signal?.aborted) return incomplete(target, "cancelled");
      if (info.isFile()) return undefined;
      if (!info.isDirectory()) return incomplete(target, "not a regular file or directory");

      const canonical = await realpath(target);
      if (visited.has(canonical)) return undefined;
      if (depth >= maxDepth) return incomplete(target, "directory depth limit exceeded");
      visited.add(canonical);

      const directory = await opendir(target);
      for await (const entry of directory) {
        const blocked = await inspect(join(target, entry.name), depth + 1);
        if (blocked) return blocked;
      }
    } catch {
      // Includes unreadable entries, dangling links, and paths disappearing
      // during traversal. Never fall through to grep after an incomplete scan.
      return incomplete(target, "could not inspect filesystem metadata");
    }
    return signal?.aborted ? incomplete(target, "cancelled") : undefined;
  }

  try {
    const kind = classifyProtectedPath(path, cwd);
    if (kind) return { kind, target: path };
    return await inspect(resolveProtectedToolPath(path, cwd), 0);
  } catch {
    return incomplete(path, "could not resolve search path");
  }
}
