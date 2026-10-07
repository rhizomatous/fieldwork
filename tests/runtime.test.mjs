import assert from "node:assert/strict";
import test from "node:test";

import { LinuxRuntime } from "../src/runtime.js";

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
  const pending = runtime.command("new_session").then(() => {
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
