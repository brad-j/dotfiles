import assert from "node:assert/strict";
import test from "node:test";
import type {
  ExtensionAPI,
  ExtensionContext,
  ToolCallEvent,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import registerProxmoxSshGate from "../extensions/proxmox-ssh-gate.ts";

type Handler = (event: ToolCallEvent, ctx: ExtensionContext) => Promise<ToolCallEventResult | void>;

function createGate(hasUI: boolean, choice?: string) {
  let handler: Handler | undefined;
  const prompts: Array<{ title: string; choices: string[] }> = [];
  const pi = {
    on(event: string, callback: Handler) {
      assert.equal(event, "tool_call");
      handler = callback;
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    hasUI,
    ui: {
      async select(title: string, choices: string[]) {
        assert.equal(hasUI, true, "non-interactive runs must not prompt");
        prompts.push({ title, choices });
        return choice;
      },
    },
  } as unknown as ExtensionContext;
  registerProxmoxSshGate(pi);
  assert.ok(handler);
  const run = handler;
  return {
    prompts,
    call(command: string, toolName = "bash") {
      return run({ type: "tool_call", toolCallId: "test", toolName, input: { command } }, ctx);
    },
  };
}

test("non-interactive gate blocks alternate SSH mutations without executing anything", async () => {
  const gate = createGate(false);
  for (const command of [
    "ssh think-1 'hostname changed-name'",
    "ssh think-1 'journalctl --vacuum-time=1s'",
    "/usr/bin/ssh think-1 'qm stop 101'",
    "env ssh think-1 'qm list'",
  ]) {
    assert.equal((await gate.call(command))?.block, true, command);
  }
  assert.equal(gate.prompts.length, 0);
});

test("read-only SSH and unrelated local commands need no approval", async () => {
  const gate = createGate(false);
  assert.equal(await gate.call("ssh think-1 'qm list'"), undefined);
  assert.equal(await gate.call("git status"), undefined);
  assert.equal(await gate.call("ssh think-1 'qm stop 101'", "read"), undefined);
});

test("one-time approval shows the full command and never carries to another call", async () => {
  const gate = createGate(true, "Allow once");
  const command = "env ssh think-1 'qm stop 101'";
  assert.equal(await gate.call(command), undefined);
  assert.equal(await gate.call(command), undefined);
  assert.equal(gate.prompts.length, 2);
  assert.ok(gate.prompts[0]!.title.includes(command));
  assert.deepEqual(gate.prompts[0]!.choices, ["Allow once", "Deny"]);
});

test("denying or dismissing approval blocks the call", async () => {
  for (const choice of ["Deny", undefined]) {
    const gate = createGate(true, choice);
    assert.equal((await gate.call("ssh think-1 'qm stop 101'"))?.block, true);
  }
});

test("sensitive commands are blocked without offering approval", async () => {
  const gate = createGate(true, "Allow once");
  const result = await gate.call("/usr/bin/ssh think-1 'cat /etc/pve/priv/token.cfg'");
  assert.equal(result?.block, true);
  assert.equal(result?.terminate, true);
  assert.equal(gate.prompts.length, 0);
});
