import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
// Deterministic transport/tool test. Model responses are explicit fixtures.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  inferenceRequestSchema,
  parseAgentEvent,
} from "../shared/contracts.ts";
import { starter } from "../src/starter.ts";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "fieldwork-smoke-"));
const bridge = path.join(root, "bridge"),
  project = path.join(root, "project");
await fs.mkdir(bridge);
await fs.mkdir(project);
for (const [file, content] of Object.entries(starter)) {
  await fs.writeFile(path.join(project, file), content);
}
const container = execFileSync(
  "docker",
  [
    "run",
    "-d",
    "--rm",
    "--platform",
    "linux/386",
    "--network",
    "none",
    "-v",
    `${bridge}:/bridge`,
    "-v",
    `${project}:/project`,
    "agent-in-browser:dev",
    "node",
    "/opt/agent/agent.bundle.mjs",
  ],
  { encoding: "utf8" },
).trim();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function json(file) {
  try {
    const value = JSON.parse(
      await fs.readFile(path.join(bridge, file), "utf8"),
    );
    return file === "request.json"
      ? inferenceRequestSchema.parse(value)
      : value;
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function events() {
  const values = await Promise.all(
    (await fs.readdir(bridge))
      .filter((name) => /^event-\d+\.json$/.test(name))
      .toSorted()
      .map(json),
  );
  for (const event of values) {
    parseAgentEvent(event);
  }
  return values;
}

async function until(fn, description) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const found = await fn();
    if (found) {
      return found;
    }
    const fatal = (await events()).find((event) => event?.type === "fatal");
    if (fatal) {
      throw new Error(fatal.message);
    }
    await delay(200);
  }
  throw new Error(`Timed out: ${description}`);
}

async function command(type, message) {
  const id = randomUUID();
  await fs.writeFile(
    path.join(bridge, "command.tmp"),
    JSON.stringify({ id, type, message }),
  );
  await fs.rename(
    path.join(bridge, "command.tmp"),
    path.join(bridge, "command.json"),
  );
  return id;
}

async function respond(request, action) {
  await writeResponse(request.id, { id: request.id, action });
}

async function writeResponse(id, value) {
  const file = path.join(bridge, `response-${id}.json`);
  await fs.writeFile(`${file}.tmp`, JSON.stringify(value));
  await fs.rename(`${file}.tmp`, file);
}

try {
  await until(
    async () => (await events()).find((event) => event?.type === "ready"),
    "Pi startup",
  );

  console.log("PASS: bundled Pi starts in Linux without network access");

  await command("prompt", "Change the HTML title to Bridge verified.");
  let request = await until(() => json("request.json"), "first model request");
  await respond(request, {
    type: "tool",
    name: "read",
    arguments: { path: "index.html" },
  });
  const first = request.id;
  request = await until(async () => {
    const value = await json("request.json");
    return value?.id !== first && value;
  }, "read continuation");

  assert.ok(
    request.context.messages.some(
      (message) => message.role === "toolResult" && !message.isError,
    ),
  );

  await respond(request, {
    type: "tool",
    name: "edit",
    arguments: {
      path: "index.html",
      edits: [
        {
          oldText: "<title>Little things</title>",
          newText: "<title>Bridge verified</title>",
        },
      ],
    },
  });

  const second = request.id;
  request = await until(async () => {
    const value = await json("request.json");
    return value?.id !== second && value;
  }, "edit continuation");

  assert.match(
    await fs.readFile(path.join(project, "index.html"), "utf8"),
    /<title>Bridge verified<\/title>/,
  );

  await respond(request, { type: "message", text: "Title changed." });
  await until(
    async () => (await events()).find((event) => event?.type === "agent_end"),
    "turn completion",
  );

  console.log(
    "PASS: real Pi read/edit tools, tool-result continuation, final response",
  );

  const resetId = await command("new_session");
  await until(
    async () =>
      (await events()).find((event) => event?.id === resetId && event.success),
    "reset acknowledgement",
  );

  assert.match(
    await fs.readFile(path.join(project, "index.html"), "utf8"),
    /Bridge verified/,
  );

  const last = request.id;
  await command("prompt", "Make another change.");
  const freshRequest = await until(async () => {
    const value = await json("request.json");
    return value?.id !== last && value;
  }, "cancel request");

  assert.equal(freshRequest.context.messages.length, 1);
  assert.equal(freshRequest.context.messages[0].role, "user");

  console.log(
    "PASS: chat reset clears Pi context and keeps edited workspace files",
  );

  await command("abort");
  await until(
    async () =>
      (await events()).filter((event) => event?.type === "agent_end").length ===
      2,
    "cancellation",
  );

  console.log("PASS: cancellation interrupts a pending inference request");

  const invalidCommandId = await command("prompt");
  await until(
    async () =>
      (await events()).find(
        (event) =>
          event.type === "response" &&
          event.id === invalidCommandId &&
          event.success === false,
      ),
    "invalid command rejection",
  );
  console.log("PASS: malformed commands receive correlated errors");

  await command("prompt", "Make a change.");
  const pendingRequest = await until(async () => {
    const value = await json("request.json");
    return value?.id !== freshRequest.id && value;
  }, "response validation request");
  await writeResponse(pendingRequest.id, {
    id: "wrong-request",
    action: {
      type: "tool",
      name: "write",
      arguments: { path: "index.html", content: "Must not execute" },
    },
  });
  await until(
    async () =>
      (await events()).some(
        (event) =>
          event.type === "message_end" &&
          event.message?.errorMessage?.includes("does not match"),
      ),
    "mismatched response rejection",
  );
  assert.match(
    await fs.readFile(path.join(project, "index.html"), "utf8"),
    /Bridge verified/,
  );
  console.log("PASS: mismatched inference responses cannot execute tools");
} finally {
  execFileSync("docker", ["rm", "-f", container], { stdio: "ignore" });
  await fs.rm(root, { recursive: true, force: true });
}
