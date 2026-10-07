import assert from "node:assert/strict";
import test from "node:test";

import {
  commandSchema,
  inferenceRequestSchema,
  inferenceResultSchema,
  parseAgentEvent,
  parseInferenceResult,
  workerMessageSchema,
  workerRequestSchema,
} from "../shared/contracts.ts";

const action = { type: "message", text: "Done" };

test("commands require prompt text and reject unsafe bridge IDs", () => {
  for (const command of [
    { id: "one", type: "prompt" },
    { id: "one", type: "prompt", message: 42 },
    { id: "one", type: "delete" },
    { id: "../outside", type: "abort" },
  ]) {
    assert.equal(commandSchema.safeParse(command).success, false);
  }
  assert.deepEqual(commandSchema.parse({ id: "one", type: "abort" }), {
    id: "one",
    type: "abort",
  });
});

test("inference results contain exactly an action or an error and match their request", () => {
  for (const result of [
    { id: "one" },
    { id: "one", action, error: "Failed" },
    { id: "one", action: { type: "tool", name: "read", arguments: [] } },
    { id: "one", action: { type: "message", text: 42 } },
  ]) {
    assert.equal(inferenceResultSchema.safeParse(result).success, false);
  }
  assert.throws(
    () => parseInferenceResult({ id: "other", action }, "one"),
    /does not match/,
  );
  assert.deepEqual(
    parseInferenceResult({ id: "one", error: "Stopped" }, "one"),
    { id: "one", error: "Stopped" },
  );
});

test("request validation preserves tool schemas and rejects malformed transcripts", () => {
  const request = {
    id: "one",
    context: {
      messages: [{ role: "user", content: "Hello" }],
      tools: [
        {
          name: "read",
          description: "Read a file",
          parameters: {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
          },
        },
      ],
    },
  };
  assert.deepEqual(inferenceRequestSchema.parse(request), request);
  for (const message of [
    { role: "user", content: 42 },
    {
      role: "assistant",
      content: [{ type: "toolCall", id: "t", name: "read", arguments: [] }],
    },
    { role: "toolResult", content: "Missing correlation" },
  ]) {
    assert.equal(
      inferenceRequestSchema.safeParse({
        id: "one",
        context: { messages: [message] },
      }).success,
      false,
    );
  }
});

test("unknown Pi events are ignored but malformed consumed events are rejected", () => {
  assert.equal(parseAgentEvent({ type: "turn_start" }), null);
  assert.throws(() => parseAgentEvent({ type: "boot", message: 42 }));
  assert.throws(() =>
    parseAgentEvent({
      type: "tool_execution_start",
      toolName: "read",
      args: { path: [] },
    }),
  );
  assert.deepEqual(parseAgentEvent({ type: "ready", extra: "Pi metadata" }), {
    type: "ready",
  });
});

test("worker schemas reject invalid generation requests and progress values", () => {
  assert.equal(
    workerRequestSchema.safeParse({
      type: "generate",
      id: "one",
      context: null,
    }).success,
    false,
  );
  assert.equal(
    workerMessageSchema.safeParse({
      type: "progress",
      progress: "half",
      text: "Loading",
    }).success,
    false,
  );
  assert.equal(
    workerMessageSchema.safeParse({ type: "result", id: "one" }).success,
    false,
  );
});
