import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  discoverAndLoadExtensions,
  type AgentToolResult,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const projectDir = resolve(import.meta.dirname, "../..");
const extensionDir = resolve(projectDir, "../pi/.pi/agent/extensions");

test("the main compiler project includes both standalone code-agent extensions", () => {
  const result = spawnSync(join(projectDir, "node_modules/.bin/tsc"), ["--listFilesOnly"], {
    cwd: projectDir,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  const files = new Set(result.stdout.trim().split(/\r?\n/));
  for (const name of ["caveman.ts", "vision-sidecar.ts"]) {
    assert.ok(files.has(join(extensionDir, name)), `${name} must remain in typecheck coverage`);
  }
});

test("standalone extensions load through the real SDK without an agent session", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "pi-code-extensions-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // Empty project/runtime roots prevent discovery of machine-local resources.
  const { extensions, errors } = await discoverAndLoadExtensions([extensionDir], root, root);
  assert.deepEqual(errors, []);
  const caveman = extensions.find((extension) => extension.commands.has("caveman"));
  assert.ok(caveman?.handlers.has("before_agent_start"));
  const vision = extensions.find((extension) => extension.tools.has("see"));
  assert.ok(vision);
  assert.ok(vision.handlers.has("tool_result"));
  const see = vision.tools.get("see")!.definition;

  // Missing model exits before authentication, image I/O, or provider calls.
  const ctx = {
    cwd: root,
    modelRegistry: { find: () => undefined },
  } as unknown as ExtensionContext;
  for (const path of ["", "unsupported.txt", "missing.png"]) {
    const updates: AgentToolResult<unknown>[] = [];
    const result = await see.execute("test", { path }, undefined, (update) => updates.push(update), ctx);
    assert.ok(Object.hasOwn(result, "details"));
    assert.match(result.content[0]?.type === "text" ? result.content[0].text : "", /^Error/);
    for (const update of updates) assert.ok(Object.hasOwn(update, "details"));
    assert.equal(updates.length, path === "missing.png" ? 1 : 0);
  }
});
