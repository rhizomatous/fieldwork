import assert from "node:assert/strict";
import test from "node:test";

import { starter } from "../shared/starter.ts";

import { createSession } from "./session.ts";

function setup(
  gpu = {
    requestAdapter: async () => ({
      limits: { maxStorageBuffersPerShaderStage: 10 },
    }),
  },
) {
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
    gpu,
  });

  const emit = (type, detail) =>
    runtime.dispatchEvent(new CustomEvent(type, { detail }));

  return {
    session,
    runtime,
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
  await t.session.boot({});
  t.emit("event", { type: "ready" });

  t.session.load();
  await t.worker.onmessage({ data: { type: "loaded" } });

  assert.match(t.session.getSnapshot().loadDetail, /8,192-token context/);

  await t.session.send("Change the title");

  assert.deepEqual(t.commands, [
    [{ type: "prompt", message: "Change the title" }],
  ]);

  t.emit("event", { type: "agent_start" });

  const files = t.session.getSnapshot().files;
  t.emit("inference", { id: "request-1", context: { messages: [] } });

  assert.equal(t.workerMessages.at(-1).type, "generate");

  await t.worker.onmessage({
    data: { type: "tokens", id: "request-1", firstToken: 120, characters: 12 },
  });

  assert.equal(t.session.getSnapshot().files, files);

  await t.worker.onmessage({
    data: {
      type: "result",
      id: "stale",
      action: { type: "message", text: "ignore" },
    },
  });

  assert.equal(t.responses.length, 0);

  await t.worker.onmessage({
    data: {
      type: "result",
      id: "request-1",
      action: { type: "message", text: "action" },
    },
  });

  assert.equal(t.responses[0].id, "request-1");

  await t.worker.onmessage({
    data: {
      type: "result",
      id: "request-1",
      action: { type: "message", text: "Done" },
    },
  });
  assert.equal(t.responses.length, 1, "duplicate results are ignored");

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
  await t.session.boot({});
  t.emit("event", { type: "ready" });
  t.session.load();
  await t.worker.onmessage({ data: { type: "loaded" } });
  await t.session.send("Change the title");
  t.emit("event", { type: "agent_start" });
  t.workerMessages.length = 0;
  t.commands.length = 0;

  await t.session.stop();

  assert.deepEqual(t.workerMessages, [{ type: "cancel" }]);
  assert.deepEqual(t.commands, [[{ type: "abort" }]]);

  t.emit("event", { type: "agent_end" });

  assert.equal(t.session.getSnapshot().busy, false);
});

test("worker failure returns an error to a pending guest request and unlocks the UI", async () => {
  const t = setup();
  await t.session.boot({});
  t.emit("event", { type: "ready" });

  t.session.load();
  await t.worker.onmessage({ data: { type: "loaded" } });

  await t.session.send("Change the title");
  t.emit("event", { type: "agent_start" });
  t.emit("inference", { id: "failed", context: { messages: [] } });
  t.worker.onerror({ message: "GPU lost" });

  assert.deepEqual(t.responses, [{ id: "failed", error: "GPU lost" }]);
  assert.equal(t.session.getSnapshot().busy, false);
  assert.equal(t.session.getSnapshot().modelReady, false);
  assert.equal(t.session.getSnapshot().modelStatus.text, "Worker failed");

  // Pi can finish its turn after the worker has already failed.
  t.emit("event", { type: "agent_end" });
  assert.equal(t.session.getSnapshot().modelPhase, "worker-error");
  assert.equal(t.session.getSnapshot().modelStatus.text, "Worker failed");
  assert.equal(t.session.getSnapshot().canLoadModel, false);
  const sent = t.workerMessages.length;
  t.session.load();
  assert.equal(t.workerMessages.length, sent);
});

test("reset chat clears the conversation but preserves workspace files and loaded model", async () => {
  const t = setup();
  await t.session.boot({});
  t.emit("event", { type: "ready" });

  t.session.load();
  await t.worker.onmessage({ data: { type: "loaded" } });
  const files = { ...starter, "index.html": "<h1>Keep this</h1>" };
  t.emit("snapshot", files);

  await t.session.send("Old conversation");
  t.emit("event", { type: "agent_start" });

  t.emit("event", { type: "agent_end" });

  await t.session.resetChat();

  assert.deepEqual(t.commands.at(-1), [{ type: "new_session" }]);
  assert.deepEqual(t.session.getSnapshot().messages, []);
  assert.equal(t.session.getSnapshot().files, files);
  assert.equal(t.session.getSnapshot().modelReady, true);
  assert.equal(t.session.getSnapshot().busy, false);
});

test("reset chat cannot interrupt an active turn", async () => {
  const t = setup();
  await t.session.boot({});
  t.emit("event", { type: "ready" });
  t.session.load();
  await t.worker.onmessage({ data: { type: "loaded" } });
  await t.session.send("Change the title");
  t.emit("event", { type: "agent_start" });
  t.commands.length = 0;
  await t.session.resetChat();
  assert.deepEqual(t.commands, []);
  assert.equal(t.session.getSnapshot().busy, true);
});

test("editor saves update preview and block concurrent prompts and reset", async () => {
  const t = setup();
  await t.session.boot({});
  t.emit("event", { type: "ready" });
  t.emit("snapshot", { ...starter });
  t.session.load();
  await t.worker.onmessage({ data: { type: "loaded" } });
  let complete;
  let resets = 0;
  t.runtime.reset = async () => {
    resets++;
  };
  t.runtime.saveFile = (file, content, expected) => {
    assert.equal(file, "style.css");
    assert.equal(expected, starter["style.css"]);
    return new Promise((resolve) => {
      complete = () => resolve({ ...starter, [file]: content });
    });
  };
  const save = t.session.saveFile(
    "style.css",
    "body { color: red; }",
    starter["style.css"],
  );
  assert.equal(t.session.getSnapshot().savingFile, "style.css");
  assert.equal(t.session.getSnapshot().canResetChat, false);
  await t.session.resetChat();
  assert.deepEqual(t.commands, []);
  assert.equal(await t.session.send("Change the title"), false);
  await t.session.reset();
  assert.equal(resets, 0);
  await assert.rejects(
    t.session.saveFile("script.js", "", starter["script.js"]),
    /current operation/,
  );
  complete();
  await save;
  assert.equal(
    t.session.getSnapshot().files["style.css"],
    "body { color: red; }",
  );
  assert.equal(t.session.getSnapshot().savingFile, null);
});

test("Linux startup derives readiness and keeps failures visible after a late completion", async () => {
  const t = setup();
  assert.equal(t.session.getSnapshot().linuxPhase, "off");
  assert.equal(t.session.getSnapshot().bootLabel, "Start Linux");
  const boot = t.session.boot({});
  assert.equal(t.session.getSnapshot().linuxPhase, "booting");
  assert.equal(t.session.getSnapshot().bootStarted, true);
  assert.equal(t.session.getSnapshot().linuxReady, false);
  await boot;
  t.emit("event", { type: "boot", message: "Starting Pi" });
  assert.equal(t.session.getSnapshot().linuxStatus.text, "Running");
  assert.equal(t.session.getSnapshot().agentStatus.text, "Starting");
  assert.equal(t.session.getSnapshot().linuxReady, false);
  await t.session.boot({});
  t.emit("event", { type: "ready" });
  assert.equal(t.session.getSnapshot().linuxReady, true);
  assert.equal(t.session.getSnapshot().bootLabel, "Linux running");
  t.emit("fatal", "VM failed");
  t.emit("event", { type: "agent_end" });
  assert.equal(t.session.getSnapshot().linuxPhase, "failed");
  assert.equal(t.session.getSnapshot().linuxStatus.kind, "error");
  assert.equal(t.session.getSnapshot().agentStatus.kind, "error");
  assert.equal(t.session.getSnapshot().canSend, false);
  assert.equal(t.session.getSnapshot().canResetProject, false);
});

test("failed startup requires a page reload and cannot boot again", async () => {
  const t = setup();
  let attempts = 0;
  t.runtime.boot = async () => {
    attempts++;
    throw new Error("Image missing");
  };
  await t.session.boot({});
  assert.equal(t.session.getSnapshot().linuxPhase, "boot-error");
  assert.equal(t.session.getSnapshot().bootLabel, "Reload to retry");
  assert.equal(t.session.getSnapshot().agentStatus.text, "Boot failed");
  assert.equal(t.session.getSnapshot().linuxReady, false);
  await t.session.boot({});
  assert.equal(attempts, 1);
});

test("guest agent startup failure requires reload even when the VM has booted", async () => {
  const t = setup();
  await t.session.boot({});
  t.emit("event", { type: "boot", message: "Loading Pi core" });
  assert.equal(t.session.getSnapshot().linuxPhase, "starting");
  t.emit("event", { type: "fatal", message: "Could not import Pi core" });
  assert.equal(t.session.getSnapshot().linuxPhase, "failed");
  assert.equal(t.session.getSnapshot().bootLabel, "Reload to retry");
  assert.match(
    t.session.getSnapshot().messages.at(-1).text,
    /Could not import Pi core/,
  );
  assert.equal(t.session.getSnapshot().canSend, false);
});

test("unsupported GPU status survives a conversation reset", async () => {
  const t = setup({ requestAdapter: async () => null });
  await Promise.resolve();
  assert.equal(t.session.getSnapshot().modelPhase, "unsupported");
  assert.equal(t.session.getSnapshot().canLoadModel, false);
  t.session.load();
  assert.deepEqual(t.workerMessages, []);
  await t.session.resetChat();
  assert.equal(t.session.getSnapshot().modelStatus.text, "Unsupported");
  assert.equal(t.session.getSnapshot().canSend, false);
});

test("model loading can retry and generation returns to ready without ending the agent turn", async () => {
  const t = setup();
  await Promise.resolve(); // GPU capability check
  await t.session.boot({});
  t.emit("event", { type: "ready" });
  t.session.load();
  assert.equal(t.session.getSnapshot().loading, true);
  assert.equal(t.session.getSnapshot().loadLabel, "Loading…");
  assert.equal(t.session.getSnapshot().canLoadModel, false);
  assert.equal(t.session.getSnapshot().canSend, false);
  assert.match(t.session.getSnapshot().loadDetail, /Preparing model download/);
  const operation = t.session.getSnapshot().operation;
  await t.worker.onmessage({
    data: { type: "progress", progress: 0.5, text: "Downloading weights" },
  });
  assert.equal(t.session.getSnapshot().progress, 0.5);
  assert.equal(t.session.getSnapshot().loadDetail, "Downloading weights");
  assert.equal(t.session.getSnapshot().modelPhase, "loading");
  assert.equal(t.session.getSnapshot().operation, operation);
  await t.worker.onmessage({
    data: { type: "load-error", error: "Download failed" },
  });
  assert.equal(t.session.getSnapshot().loading, false);
  assert.equal(t.session.getSnapshot().loadLabel, "Retry model");
  assert.equal(t.session.getSnapshot().loadDetail, "Download failed");
  assert.equal(t.session.getSnapshot().canLoadModel, true);
  t.session.load();
  assert.equal(t.session.getSnapshot().progress, 0);
  assert.match(t.session.getSnapshot().loadDetail, /Preparing model download/);
  await t.worker.onmessage({ data: { type: "loaded" } });
  const loaded = t.session.getSnapshot();
  assert.match(loaded.loadDetail, /8,192-token context/);
  await t.worker.onmessage({
    data: { type: "progress", progress: 0.9, text: "Late progress" },
  });
  assert.equal(t.session.getSnapshot(), loaded);
  assert.equal(t.session.getSnapshot().canSend, true);
  await t.session.send("Change the title");
  assert.equal(t.session.getSnapshot().operation.type, "prompting");
  t.emit("event", { type: "agent_start" });
  t.emit("inference", { id: "one", context: { messages: [] } });
  assert.equal(t.session.getSnapshot().modelPhase, "generating");
  assert.equal(t.session.getSnapshot().canSend, false);
  await t.worker.onmessage({
    data: {
      type: "result",
      id: "one",
      action: { type: "message", text: "Done" },
    },
  });
  assert.equal(t.session.getSnapshot().modelPhase, "ready");
  assert.equal(t.session.getSnapshot().busy, true);
  assert.equal(t.session.getSnapshot().canStop, true);
  t.emit("event", { type: "agent_end" });
  assert.equal(t.session.getSnapshot().canSend, true);
  assert.equal(t.session.getSnapshot().canStop, false);
});

test("chat reset stays busy until acknowledged and preserves a concurrent model load", async () => {
  const t = setup();
  await Promise.resolve();
  await t.session.boot({});
  t.emit("event", { type: "ready" });
  t.session.load();
  let acknowledge;
  t.runtime.command = () =>
    new Promise((resolve) => {
      acknowledge = resolve;
    });
  const reset = t.session.resetChat();
  assert.equal(t.session.getSnapshot().resettingChat, true);
  assert.equal(t.session.getSnapshot().busy, true);
  assert.equal(t.session.getSnapshot().canStop, false);
  assert.equal(t.session.getSnapshot().canSend, false);
  acknowledge();
  await reset;
  assert.equal(t.session.getSnapshot().resettingChat, false);
  assert.equal(t.session.getSnapshot().busy, false);
  assert.equal(t.session.getSnapshot().modelPhase, "loading");
  assert.equal(t.session.getSnapshot().modelStatus.text, "Loading");
});

test("worker failure during a file save does not release the workspace lock", async () => {
  const t = setup();
  await t.session.boot({});
  t.emit("event", { type: "ready" });
  t.emit("snapshot", { ...starter });
  let complete;
  t.runtime.saveFile = () =>
    new Promise((resolve) => {
      complete = () => resolve({ ...starter, "style.css": "new" });
    });
  const save = t.session.saveFile("style.css", "new", starter["style.css"]);
  t.worker.onerror({ message: "GPU lost" });
  assert.equal(t.session.getSnapshot().savingFile, "style.css");
  assert.equal(t.session.getSnapshot().canResetProject, false);
  complete();
  await save;
  assert.equal(t.session.getSnapshot().savingFile, null);
  assert.equal(t.session.getSnapshot().modelPhase, "worker-error");
});

test("editor rejects stale drafts and retains workspace after failed writes", async () => {
  const t = setup();
  await t.session.boot({});
  t.emit("event", { type: "ready" });
  t.emit("snapshot", { ...starter });
  let writes = 0;
  t.runtime.saveFile = async () => {
    writes++;
    throw new Error("Storage full");
  };
  await assert.rejects(
    t.session.saveFile("index.html", "new", "outdated"),
    /changed in the workspace/,
  );
  assert.equal(writes, 0);
  await assert.rejects(
    t.session.saveFile("index.html", "new", starter["index.html"]),
    /Storage full/,
  );
  assert.equal(
    t.session.getSnapshot().files["index.html"],
    starter["index.html"],
  );
  assert.equal(t.session.getSnapshot().savingFile, null);
  t.session.load();
  await t.worker.onmessage({ data: { type: "loaded" } });
  await t.session.send("Change the title");
  t.emit("event", { type: "agent_start" });
  await assert.rejects(
    t.session.saveFile("index.html", "new", starter["index.html"]),
    /current operation/,
  );
});

test("malformed worker results fail the pending request instead of reaching the guest", async () => {
  const t = setup();
  await t.session.boot({});
  t.emit("event", { type: "ready" });
  t.session.load();
  await t.worker.onmessage({ data: { type: "loaded" } });
  t.emit("inference", { id: "one", context: { messages: [] } });
  await t.worker.onmessage({
    data: {
      type: "result",
      id: "one",
      action: { type: "tool", name: "write", arguments: [] },
    },
  });
  assert.equal(t.responses.length, 1);
  assert.equal(t.responses[0].id, "one");
  assert.match(t.responses[0].error, /Invalid inference worker message/);
  assert.equal(t.responses[0].action, undefined);
  assert.equal(t.session.getSnapshot().modelPhase, "worker-error");
});
