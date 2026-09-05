import assert from "node:assert/strict";
import test from "node:test";
import type {
  ExtensionAPI,
  ExtensionContext,
  SessionCompactEvent,
} from "@earendil-works/pi-coding-agent";
import registerCheckpoint from "../extensions/continue-after-compaction.ts";

type Handler = (event: SessionCompactEvent, ctx: ExtensionContext) => unknown;

function fixture(commands = ["close", "handoff"]) {
  const handlers = new Map<string, Handler>();
  const notices: Array<{ message: string; level: string }> = [];
  let handoffListener: ((active: unknown) => void) | undefined;
  let unsubscribed = false;
  const api = {
    on(name: string, handler: Handler) { handlers.set(name, handler); },
    events: {
      on(name: string, handler: (active: unknown) => void) {
        assert.equal(name, "brad:handoff-state");
        handoffListener = handler;
        return () => { unsubscribed = true; handoffListener = undefined; };
      },
    },
    getCommands: () => commands.map((name) => ({ name })),
  };
  // Unexpected API calls (including sendUserMessage/sendMessage) fail the test.
  registerCheckpoint(new Proxy(api, {
    get(target, key) {
      assert.ok(key in target, `Unexpected Pi API access: ${String(key)}`);
      return Reflect.get(target, key);
    },
  }) as unknown as ExtensionAPI);

  const ctx = {
    hasUI: true,
    ui: { notify(message: string, level: string) { notices.push({ message, level }); } },
    get sessionManager(): never { throw new Error("Must not inspect session history"); },
    abort(): never { throw new Error("Must not interfere with native continuation"); },
  } as unknown as ExtensionContext;
  const emit = (name: string, event: SessionCompactEvent, context = ctx) =>
    handlers.get(name)?.(event, context);

  return {
    notices,
    compact: (reason: SessionCompactEvent["reason"], willRetry = false, hasUI = true) => {
      // No compaction entry needed: the handler must not read summaries or history.
      const event = { type: "session_compact", reason, willRetry } as SessionCompactEvent;
      ctx.hasUI = hasUI;
      assert.equal(emit("session_compact", event), undefined);
    },
    handoff: (active: unknown) => handoffListener?.(active),
    shutdown: () => emit("session_shutdown", {} as SessionCompactEvent),
    get unsubscribed() { return unsubscribed; },
    registeredEvents: () => [...handlers.keys()].sort(),
  };
}

for (const reason of ["manual", "threshold", "overflow"] as const) {
  test(`${reason} without retry gives a notice, never a continuation`, (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const checkpoint = fixture();
    checkpoint.compact(reason);
    t.mock.timers.runAll();
    assert.equal(checkpoint.notices.length, 1);
    assert.match(checkpoint.notices[0]!.message, new RegExp(`Compaction complete \\(${reason}\\)`));
    assert.match(checkpoint.notices[0]!.message, /No extra continuation queued/);
    assert.match(checkpoint.notices[0]!.message, /At the next stopping point/);
    assert.match(checkpoint.notices[0]!.message, /\/close or \/handoff/);
    assert.equal(checkpoint.notices[0]!.level, "info");
  });
}

test("automatic retry receives no notice or extra action", () => {
  const checkpoint = fixture();
  for (const reason of ["manual", "threshold", "overflow"] as const) {
    checkpoint.compact(reason, true);
  }
  assert.deepEqual(checkpoint.notices, []);
});

test("non-UI runs remain silent", () => {
  const checkpoint = fixture();
  for (const reason of ["manual", "threshold", "overflow"] as const) {
    checkpoint.compact(reason, false, false);
  }
  assert.deepEqual(checkpoint.notices, []);
});

test("handoff suppresses notices until its boolean state clears", () => {
  const checkpoint = fixture();
  checkpoint.handoff(true);
  checkpoint.handoff("false");
  checkpoint.compact("threshold");
  assert.deepEqual(checkpoint.notices, []);
  checkpoint.handoff(false);
  checkpoint.compact("manual");
  assert.equal(checkpoint.notices.length, 1);
});

test("writing-like profiles are not offered unavailable workflow commands", () => {
  const checkpoint = fixture(["websearch", "skill:unrelated"]);
  checkpoint.compact("manual");
  assert.equal(checkpoint.notices.length, 1);
  assert.doesNotMatch(checkpoint.notices[0]!.message, /\/close|\/handoff|Available checkpoints/);
  assert.match(checkpoint.notices[0]!.message, /choose whether to stop or continue/);
});

test("only currently available checkpoint commands are recommended", () => {
  const commands = ["handoff"];
  const checkpoint = fixture(commands);
  checkpoint.compact("manual");
  assert.match(checkpoint.notices[0]!.message, /Available checkpoints: \/handoff\./);
  assert.doesNotMatch(checkpoint.notices[0]!.message, /\/close/);
  commands.splice(0, 1, "close");
  checkpoint.compact("threshold");
  assert.match(checkpoint.notices[1]!.message, /Available checkpoints: \/close\./);
  assert.doesNotMatch(checkpoint.notices[1]!.message, /\/handoff/);
});

test("only successful compaction is observed; shutdown releases the shared listener", () => {
  const checkpoint = fixture();
  assert.deepEqual(checkpoint.registeredEvents(), ["session_compact", "session_shutdown"]);
  checkpoint.shutdown();
  checkpoint.shutdown();
  assert.equal(checkpoint.unsubscribed, true);
  assert.deepEqual(checkpoint.notices, []);
});
