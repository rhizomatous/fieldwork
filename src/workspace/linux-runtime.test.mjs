import assert from "node:assert/strict";
import test from "node:test";

import { starter } from "../../shared/starter.ts";

import { LinuxRuntime } from "./linux-runtime.ts";

test("project reset restores starter files without resetting the agent", async () => {
  const runtime = new LinuxRuntime();
  const files = Object.fromEntries(
    Object.keys(starter).map((file) => [`project/${file}`, "edited"]),
  );
  runtime.root = {
    readText: async (path) => files[path],
    writeFile: async (path, content) => {
      files[path] = content;
    },
  };
  runtime.command = async () =>
    assert.fail("Project reset sent an agent command");
  let snapshot;
  runtime.addEventListener("snapshot", ({ detail }) => {
    snapshot = detail;
  });

  await runtime.reset();

  assert.deepEqual(snapshot, starter);
  for (const [file, content] of Object.entries(starter)) {
    assert.equal(files[`project/${file}`], content);
  }
});

test("new session waits for its matching guest acknowledgement", async () => {
  const runtime = new LinuxRuntime();
  let command;
  runtime.root = {
    writeFile: async (_, value) => {
      command = JSON.parse(value);
    },
    rename: async () => {},
  };
  let resolved = false;
  const pending = runtime.command({ type: "new_session" }).then(() => {
    resolved = true;
  });

  await new Promise((resolve) => setImmediate(resolve));
  runtime.emit("event", { type: "response", id: "unrelated", success: true });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resolved, false);
  runtime.emit("event", { type: "response", id: command.id, success: true });

  await pending;
  assert.equal(resolved, true);
});

test("file saves validate names and base content before atomic replacement", async () => {
  const runtime = new LinuxRuntime();
  const files = {
    "project/index.html": "old",
    "project/style.css": "",
    "project/script.js": "",
  };
  runtime.root = {
    readText: async (path) => files[path],
    writeFile: async (path, value) => {
      files[path] = value;
    },
    rename: async (from, to) => {
      files[to] = files[from];
      delete files[from];
    },
  };
  await assert.rejects(runtime.saveFile("../secret", "new", "old"), /Unknown/);
  await assert.rejects(
    runtime.saveFile("index.html", "new", "stale"),
    /changed/,
  );
  assert.equal(files["project/index.html"], "old");
  const snapshot = await runtime.saveFile("index.html", "new", "old");
  assert.equal(snapshot["index.html"], "new");
  assert.equal(files["project/index.html.tmp"], undefined);
});

test("inference continues when optional recovery context cannot be read", async () => {
  const runtime = new LinuxRuntime();
  let attempts = 0;
  let inference;
  runtime.root = {
    readDir: async () => ["request.json"],
    readText: async (path) => {
      if (path === "bridge/request.json") {
        return JSON.stringify({ id: "request-1", context: { messages: [] } });
      }
      if (path === "project/index.html" && attempts++ === 0) {
        throw new Error("Transient snapshot read failure");
      }
      return `fresh ${path}`;
    },
  };
  runtime.addEventListener("inference", ({ detail }) => {
    inference = detail;
    runtime.running = false;
  });
  runtime.running = true;
  await runtime.poll();
  assert.equal(attempts, 1);
  assert.equal(inference.context.workspaceFiles, undefined);
  assert.equal(inference.id, "request-1");
});

test("malformed guest events cannot block later events in the bridge", async () => {
  const runtime = new LinuxRuntime();
  const files = new Map([
    ["bridge/event-00000001.json", "{"],
    [
      "bridge/event-00000002.json",
      JSON.stringify({ type: "boot", message: 12 }),
    ],
    ["bridge/event-00000003.json", JSON.stringify({ type: "turn_start" })],
    ["bridge/event-00000004.json", JSON.stringify({ type: "ready" })],
  ]);
  runtime.root = {
    readDir: async () => [...files.keys()].map((name) => name.slice(7)),
    readText: async (path) => files.get(path),
    remove: async (path) => files.delete(path),
  };
  const diagnostics = [];
  const events = [];
  runtime.addEventListener("diagnostic", ({ detail }) =>
    diagnostics.push(detail),
  );
  runtime.addEventListener("event", ({ detail }) => {
    events.push(detail);
    runtime.running = false;
  });
  runtime.running = true;
  await runtime.poll();
  assert.deepEqual(events, [{ type: "ready" }]);
  assert.equal(diagnostics.length, 2);
  assert.equal(files.size, 0);
});

test("invalid inference requests return one correlated error without dispatching inference", async () => {
  const runtime = new LinuxRuntime();
  const responses = [];
  const diagnostics = [];
  runtime.respond = async (response) => responses.push(response);
  runtime.addEventListener("inference", () =>
    assert.fail("Invalid request reached inference"),
  );
  runtime.addEventListener("diagnostic", ({ detail }) =>
    diagnostics.push(detail),
  );
  const badRequest = JSON.stringify({ id: "one", context: { messages: 42 } });
  await runtime.receiveRequest(badRequest);
  await runtime.receiveRequest(badRequest);
  await runtime.receiveRequest(
    JSON.stringify({ id: "../outside", context: {} }),
  );
  await runtime.receiveRequest("{");
  assert.equal(responses.length, 1);
  assert.equal(responses[0].id, "one");
  assert.match(responses[0].error, /Invalid inference request/);
  assert.equal(diagnostics.length, 4);
});
