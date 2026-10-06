import test from "node:test";
import assert from "node:assert/strict";
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
