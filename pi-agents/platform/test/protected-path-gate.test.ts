import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test, { type TestContext } from "node:test";
import {
  createGrepTool,
  type ExtensionAPI,
  type ExtensionContext,
  type ToolCallEvent,
  type ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import registerProtectedPathGate from "../extensions/protected-path-gate.ts";

type Handler = (event: ToolCallEvent, ctx: ExtensionContext) => Promise<ToolCallEventResult | void>;

function createGate(cwd: string, signal?: AbortSignal) {
  let handler: Handler | undefined;
  registerProtectedPathGate({
    on(event: string, callback: Handler) {
      assert.equal(event, "tool_call");
      handler = callback;
    },
  } as unknown as ExtensionAPI);
  assert.ok(handler);
  const run = handler;
  const ctx = { cwd, signal, hasUI: false } as ExtensionContext;
  return (toolName: string, input: Record<string, unknown>) =>
    run({ type: "tool_call", toolCallId: "test", toolName, input }, ctx);
}

function fixture(t: TestContext): string {
  const root = mkdtempSync(join(tmpdir(), "pi-gate-coverage-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

for (const tool of ["read", "write", "edit", "grep", "find", "ls", "see"]) {
  test(`${tool} rejects a direct secret path before execution`, async () => {
    const result = await createGate("/work/project")(tool, { path: "auth.json" });
    assert.equal(result?.block, true);
    assert.equal(result?.terminate, true);
    assert.ok(result?.reason?.includes(`blocked ${tool}`));
    assert.ok(result?.reason?.includes("agent authentication"));
  });
}

test("see cannot route an innocent-looking image alias to protected contents", async (t) => {
  const root = fixture(t);
  writeFileSync(join(root, "credentials.json"), "SYNTHETIC_SECRET");
  symlinkSync(join(root, "credentials.json"), join(root, "preview.png"));
  assert.equal((await createGate(root)("see", { path: "@preview.png" }))?.block, true);
});

test("directory grep checks cwd defaults and does not trust glob or ignore filters", async (t) => {
  const root = fixture(t);
  writeFileSync(join(root, ".env"), "SYNTHETIC_SECRET");
  writeFileSync(join(root, ".gitignore"), ".env\n");
  const gate = createGate(root);
  for (const input of [
    { pattern: "." },
    { pattern: ".", path: "" },
    { pattern: ".", path: ".", glob: "*.ts" },
  ]) {
    const result = await gate("grep", input);
    assert.equal(result?.block, true);
    assert.ok(result?.reason?.includes("narrower directory"));
  }
});

test("direct safe files and narrow clean directories still work in a mixed workspace", async (t) => {
  const root = fixture(t);
  writeFileSync(join(root, ".env"), "SYNTHETIC_SECRET");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "main.ts"), "safe source");
  const gate = createGate(root);
  for (const path of ["src/main.ts", "src"]) {
    assert.equal(await gate("grep", { pattern: "safe", path }), undefined);
  }
  for (const tool of ["read", "write", "edit", "see"]) {
    assert.equal(await gate(tool, { path: "src/ordinary.png" }), undefined);
  }
  // Listing ordinary directories reveals names, not file contents; no deep scan.
  for (const tool of ["find", "ls"]) assert.equal(await gate(tool, {}), undefined);
});

test("find/ls default paths cannot enumerate inside a protected directory", async () => {
  const gate = createGate("/work/.ssh");
  for (const tool of ["find", "ls"]) {
    assert.equal((await gate(tool, {}))?.block, true);
    assert.equal((await gate(tool, { path: "" }))?.block, true);
  }
});

test("shell checks cover bash and PowerShell without changing ordinary commands", async () => {
  const gate = createGate("/work/project");
  for (const tool of ["bash", "powershell"]) {
    assert.equal((await gate(tool, { command: 'Get-Content "./auth.json"' }))?.block, true);
    assert.equal(await gate(tool, { command: "git status --short" }), undefined);
  }
  assert.equal((await gate("powershell", {
    command: String.raw`Get-Content "$env:USERPROFILE\.pi\agent\auth.json"`,
  }))?.block, true);
  assert.equal(await gate("web_search", { query: "credentials documentation" }), undefined);
});

test("invalid paths, incomplete scans, and cancellation fail closed", async (t) => {
  const root = fixture(t);
  const gate = createGate(root);
  assert.equal((await gate("see", {}))?.block, true);
  assert.equal((await gate("read", { path: "file:///%ZZ" }))?.block, true);
  assert.equal((await gate("grep", { path: "missing", pattern: "." }))?.block, true);
  const controller = new AbortController();
  controller.abort();
  assert.equal((await createGate(root, controller.signal)("grep", { pattern: "." }))?.block, true);
});

test("built-in grep executes only the permitted search and preserves its result", async (t) => {
  // Avoid Pi's tool-download fallback if this machine does not already have rg.
  if (spawnSync("rg", ["--version"]).status !== 0) return t.skip("requires installed ripgrep");
  const root = fixture(t);
  const marker = "SYNTHETIC_SECRET_DO_NOT_RETURN";
  writeFileSync(join(root, "auth.json"), marker);
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "main.ts"), "safe needle\n");
  const gate = createGate(root);
  const grep = createGrepTool(root);
  let executions = 0;
  for (const path of [".", "auth.json", "src"]) {
    const params = { path, pattern: "needle", context: 1 };
    const decision = await gate("grep", params);
    if (decision?.block) {
      assert.notEqual(path, "src");
      assert.ok(!JSON.stringify(decision).includes(marker));
      continue;
    }
    executions += 1;
    assert.equal(path, "src");
    const result = await grep.execute("test", params);
    assert.ok(JSON.stringify(result).includes("safe needle"));
    assert.ok(!JSON.stringify(result).includes(marker));
  }
  assert.equal(executions, 1);
});
