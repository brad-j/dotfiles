import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  classifyProtectedCommand,
  classifyProtectedPath,
  matchProtectedCommand,
} from "../lib/protected-paths.ts";

const cwd = "/work/project";

test("classifies protected files and directories", () => {
  assert.equal(classifyProtectedPath("/Users/example/.pi/agent/auth.json", cwd), "agent authentication");
  assert.equal(classifyProtectedPath(".env.production", cwd), "environment or credential file");
  assert.equal(classifyProtectedPath("~/.ssh/config", cwd), "private key material");
  assert.equal(classifyProtectedPath("certs/server.pem", cwd), "private key material");
  assert.equal(classifyProtectedPath("src/auth.ts", cwd), undefined);
  assert.equal(classifyProtectedPath("docs/environment.md", cwd), undefined);
});

test("resolves symlinks before classifying paths", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-protected-paths-"));
  const privateDirectory = join(root, ".ssh");
  const alias = join(root, "keys");
  mkdirSync(privateDirectory);
  symlinkSync(privateDirectory, alias);

  assert.equal(classifyProtectedPath(join(alias, "id_test"), root), "private key material");
});

test("blocks shell commands that mention protected paths", () => {
  assert.equal(classifyProtectedCommand("cat ~/.pi/agent/auth.json", cwd), "agent authentication");
  assert.equal(classifyProtectedCommand("python -c 'open(\".env.local\")'", cwd), "environment or credential file");
  assert.equal(classifyProtectedCommand("cp ~/.ssh/id_ed25519 /tmp/key", cwd), "private key material");
  assert.equal(classifyProtectedCommand("rg credential-handling src", cwd), undefined);
});

test("identifies the target that caused a shell command to be blocked", () => {
  assert.deepEqual(matchProtectedCommand("cat ~/.pi/agent/auth.json", cwd), {
    kind: "agent authentication",
    target: "auth.json",
  });
  assert.deepEqual(matchProtectedCommand("python -c 'open(\".env.local\")'", cwd), {
    kind: "environment or credential file",
    target: ".env.local",
  });
  assert.deepEqual(matchProtectedCommand("cp ~/.ssh/id_ed25519 /tmp/key", cwd), {
    kind: "private key material",
    target: "id_ed25519",
  });
});

test("blocks every shell command when the working directory is protected", () => {
  assert.equal(classifyProtectedCommand("ls", "/Users/example/.ssh"), "private key material");
  assert.deepEqual(matchProtectedCommand("ls", "/Users/example/.ssh"), {
    kind: "private key material",
    target: "/Users/example/.ssh",
  });
});
