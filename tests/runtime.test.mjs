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
