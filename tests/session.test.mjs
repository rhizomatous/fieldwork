import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/session.js";
import { starter } from "../src/starter.js";

function setup() {
  const runtime = new EventTarget();
  const commands = [],
    responses = [],
    workerMessages = [];
  let boots = 0;
  runtime.boot = async () => {
    boots++;
  };
  runtime.command = async (...args) => commands.push(args);
  runtime.respond = async (data) => responses.push(data);
  const worker = { postMessage: (data) => workerMessages.push(data) };
  const session = createSession({
    runtime,
    worker,
    gpu: {
      requestAdapter: async () => ({
        limits: { maxStorageBuffersPerShaderStage: 10 },
      }),
    },
  });
  const emit = (type, detail) =>
    runtime.dispatchEvent(new CustomEvent(type, { detail }));
  return {
    session,
    worker,
    emit,
    commands,
    responses,
    workerMessages,
    boots: () => boots,
  };
}

test("subscriptions can detach and reattach without losing the session or booting twice", async () => {
  const t = setup();
  await t.session.boot({});
  t.emit("event", { type: "ready" });
  const snapshot = t.session.getSnapshot();
  const unsubscribe = t.session.subscribe(() => {});
  unsubscribe();
  t.session.subscribe(() => {});
  await t.session.boot({});
  assert.equal(t.boots(), 1);
  assert.equal(t.session.getSnapshot(), snapshot);
  assert.equal(snapshot.linuxReady, true);
});

test("a prompt routes inference and edits while metrics leave the preview files stable", async () => {
  const t = setup();
  t.emit("event", { type: "ready" });
  await t.worker.onmessage({ data: { type: "loaded" } });
  await t.session.send("Change the title");
  assert.deepEqual(t.commands, [["prompt", "Change the title"]]);
  t.emit("event", { type: "agent_start" });
  const files = t.session.getSnapshot().files;
  t.emit("inference", { id: "request-1", context: {} });
  assert.equal(t.workerMessages.at(-1).type, "generate");
  await t.worker.onmessage({
    data: { type: "tokens", id: "request-1", firstToken: 120, characters: 12 },
  });
  assert.equal(t.session.getSnapshot().files, files);
  await t.worker.onmessage({
    data: { type: "result", id: "stale", text: "ignore" },
  });
  assert.equal(t.responses.length, 0);
  await t.worker.onmessage({
    data: { type: "result", id: "request-1", text: "action" },
  });
  assert.equal(t.responses[0].id, "request-1");
  t.emit("snapshot", { ...starter, "index.html": "<h1>Updated</h1>" });
  t.emit("event", { type: "agent_end" });
  assert.equal(t.session.getSnapshot().busy, false);
  assert.equal(t.session.getSnapshot().revision, 1);
  assert.ok(
    !t.session
      .getSnapshot()
      .messages.some((m) => m.text.includes("No app files changed")),
  );
});

test("stopping cancels both inference and the guest agent", async () => {
  const t = setup();
  t.emit("event", { type: "agent_start" });
  await t.session.stop();
  assert.deepEqual(t.workerMessages, [{ type: "cancel" }]);
  assert.deepEqual(t.commands, [["abort"]]);
  t.emit("event", { type: "agent_end" });
  assert.equal(t.session.getSnapshot().busy, false);
});

test("worker failure returns an error to a pending guest request and unlocks the UI", async () => {
  const t = setup();
  t.emit("event", { type: "ready" });
  await t.worker.onmessage({ data: { type: "loaded" } });
  t.emit("event", { type: "agent_start" });
  t.emit("inference", { id: "failed" });
  t.worker.onerror({ message: "GPU lost" });
  assert.deepEqual(t.responses, [{ id: "failed", error: "GPU lost" }]);
  assert.equal(t.session.getSnapshot().busy, false);
  assert.equal(t.session.getSnapshot().modelReady, false);
  assert.equal(t.session.getSnapshot().modelStatus.text, "Worker failed");
});
