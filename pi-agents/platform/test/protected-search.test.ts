import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test, { type TestContext } from "node:test";
import { classifyProtectedPath } from "../lib/protected-paths.ts";
import { inspectProtectedSearch } from "../lib/protected-search.ts";

function fixture(t: TestContext): string {
  const root = mkdtempSync(join(tmpdir(), "pi-search-coverage-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("normalizes @, file URLs, and Unicode spaces before resolving aliases", (t) => {
  const root = fixture(t);
  const secret = join(root, "auth.json");
  writeFileSync(secret, "SYNTHETIC_SECRET");
  symlinkSync(secret, join(root, "an alias.txt"));
  for (const path of [
    "@an alias.txt",
    `@${join(root, "an alias.txt")}`,
    "an\u202Falias.txt",
    pathToFileURL(join(root, "an alias.txt")).href,
    pathToFileURL(secret).href.replace("auth.json", "%61uth.json"),
  ]) {
    assert.equal(classifyProtectedPath(path, root), "agent authentication", path);
  }
});

test("also checks the literal path used by the image sidecar", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, "credentials.json"), "SYNTHETIC_SECRET");
  writeFileSync(join(root, "photo name.png"), "safe");
  symlinkSync(join(root, "credentials.json"), join(root, "photo\u202Fname.png"));
  assert.equal(classifyProtectedPath("@photo\u202Fname.png", root), "environment or credential file");
});

test("allows an ordinary file and a clean recursive search", async (t) => {
  const root = fixture(t);
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "main.ts"), "safe source");
  assert.equal(await inspectProtectedSearch("src/main.ts", root), undefined);
  assert.equal(await inspectProtectedSearch(".", root), undefined);
  assert.equal(await inspectProtectedSearch(`@${root}`, root), undefined);
});

test("blocks hidden credentials in descendants without returning their contents", async (t) => {
  const root = fixture(t);
  mkdirSync(join(root, "nested"));
  const target = join(root, "nested", ".env.local");
  writeFileSync(target, "SYNTHETIC_SECRET_DO_NOT_RETURN");
  const result = await inspectProtectedSearch(".", root);
  assert.equal(result?.kind, "environment or credential file");
  assert.equal(result?.target, target);
  assert.ok(!JSON.stringify(result).includes("SYNTHETIC_SECRET_DO_NOT_RETURN"));
});

test("blocks protected directories even when empty", async (t) => {
  const root = fixture(t);
  mkdirSync(join(root, ".ssh"));
  assert.equal((await inspectProtectedSearch(".", root))?.kind, "private key material");
});

test("checks symlinked files and descendants of symlinked directories", async (t) => {
  const root = fixture(t);
  const outside = fixture(t);
  writeFileSync(join(outside, "auth.json"), "SYNTHETIC_SECRET");
  symlinkSync(join(outside, "auth.json"), join(root, "innocent.txt"));
  assert.equal((await inspectProtectedSearch("innocent.txt", root))?.kind, "agent authentication");
  symlinkSync(outside, join(root, "linked-directory"));
  assert.equal((await inspectProtectedSearch("linked-directory", root))?.kind, "agent authentication");
});

test("terminates directory symlink cycles", async (t) => {
  const root = fixture(t);
  symlinkSync(root, join(root, "loop"));
  assert.equal(await inspectProtectedSearch(".", root), undefined);
});

test("fails closed for missing paths and dangling aliases", async (t) => {
  const root = fixture(t);
  symlinkSync(join(root, "missing"), join(root, "dangling"));
  assert.equal((await inspectProtectedSearch("missing", root))?.kind, "search preflight incomplete");
  assert.equal((await inspectProtectedSearch(".", root))?.kind, "search preflight incomplete");
});

test("bounds entry count and directory depth without allowing a partial scan", async (t) => {
  const root = fixture(t);
  mkdirSync(join(root, "a", "b"), { recursive: true });
  assert.equal((await inspectProtectedSearch(".", root, { maxEntries: 1 }))?.detail, "entry limit exceeded");
  assert.equal((await inspectProtectedSearch(".", root, { maxDepth: 1 }))?.detail, "directory depth limit exceeded");
});

test("fails closed on cancellation and malformed file URLs", async (t) => {
  const root = fixture(t);
  const controller = new AbortController();
  controller.abort();
  assert.equal((await inspectProtectedSearch(".", root, { signal: controller.signal }))?.detail, "cancelled");
  assert.equal((await inspectProtectedSearch("file:///%ZZ", root))?.kind, "search preflight incomplete");
});
