import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { classifyWritingMutation } from "../lib/writing-paths.ts";

const cwd = "/work/scifi-novel";

test("allows generated outputs at the writing-home and project levels", () => {
  assert.equal(classifyWritingMutation("workbench/continuity.md", cwd), undefined);
  assert.equal(classifyWritingMutation("research/orbital-habitats.md", cwd), undefined);
  assert.equal(classifyWritingMutation("admin/submissions.md", cwd), undefined);
  assert.equal(classifyWritingMutation("ideas/loose-note.md", cwd), undefined);
  assert.equal(classifyWritingMutation("project-a/workbench/continuity.md", cwd), undefined);
  assert.equal(classifyWritingMutation("project-b/research/gravity.md", cwd), undefined);
});

test("blocks author-owned material at every project depth", () => {
  assert.equal(classifyWritingMutation("manuscript/01.md", cwd), "author-owned material");
  assert.equal(classifyWritingMutation("source-notes/idea.md", cwd), "author-owned material");
  assert.equal(classifyWritingMutation("project-a/manuscript/01.md", cwd), "author-owned material");
  assert.equal(classifyWritingMutation("project-b/source-notes/idea.md", cwd), "author-owned material");
  assert.equal(classifyWritingMutation("project-a/manuscript/workbench/escape.md", cwd), "author-owned material");
});

test("blocks mutations outside generated directories", () => {
  assert.equal(classifyWritingMutation("project.md", cwd), "outside generated-output directories");
  assert.equal(classifyWritingMutation("AGENTS.md", cwd), "outside generated-output directories");
  assert.equal(classifyWritingMutation("/tmp/notes.md", cwd), "outside generated-output directories");
});

test("blocks symlink escapes from generated directories", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-writing-boundary-"));
  const workbench = join(root, "workbench");
  const outside = join(root, "outside");
  mkdirSync(workbench);
  mkdirSync(outside);
  symlinkSync(outside, join(workbench, "escape"));

  assert.equal(
    classifyWritingMutation(join(workbench, "escape", "notes.md"), root),
    "outside generated-output directories",
  );
});

test("blocks a generated-directory symlink that points outside the workspace", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-writing-root-boundary-"));
  const outside = mkdtempSync(join(tmpdir(), "pi-writing-outside-"));
  symlinkSync(outside, join(root, "workbench"));

  assert.equal(
    classifyWritingMutation(join(root, "workbench", "notes.md"), root),
    "outside generated-output directories",
  );
});
