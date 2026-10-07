import assert from "node:assert/strict";
import test from "node:test";

import { compactContext, editFeedback } from "../src/inference-context.ts";

const user = { role: "user", content: "Add a working button" };
const call = (id, name, args) => ({
  role: "assistant",
  content: [{ type: "toolCall", id, name, arguments: args }],
});
const result = (id, text, isError = false) => ({
  role: "toolResult",
  toolCallId: id,
  isError,
  content: [{ type: "text", text }],
});

test("new turns retain recent dialogue but discard old tool payloads", () => {
  const transcript = [
    user,
    call("1", "read", { path: "script.js" }),
    result("1", "old code"),
    {
      role: "assistant",
      content: [{ type: "text", text: "Added the button" }],
    },
    { role: "user", content: "Make it blue" },
  ];
  const compacted = compactContext(transcript);
  assert.deepEqual(
    compacted.map((message) => message.content),
    ["Add a working button", "Added the button", "Make it blue"],
  );
});

test("a successful write supersedes a read, while retaining exact saved contents", () => {
  const transcript = [
    user,
    call("1", "read", { path: "script.js" }),
    result("1", "old code"),
    call("2", "write", { path: "script.js", content: "new code" }),
    result("2", "Saved"),
  ];
  const compacted = compactContext(transcript);
  assert.match(compacted[2].content[0].text, /newer successful/);
  assert.equal(compacted[3].content[0].arguments.content, "new code");
  assert.equal(
    transcript[2].content[0].text,
    "old code",
    "does not mutate Pi history",
  );
});

test("failed writes never become file state or displace a successful read", () => {
  const compacted = compactContext([
    user,
    call("1", "read", { path: "script.js" }),
    result("1", "real code"),
    call("2", "write", { path: "script.js", content: "unsaved code" }),
    result("2", "Permission denied", true),
  ]);
  assert.equal(compacted[2].content[0].text, "real code");
  assert.match(compacted[3].content[0].arguments.content, /omitted/);
  assert.equal(compacted[4].isError, true);
});

test("a partial read preserves both itself and the earlier complete snapshot", () => {
  const compacted = compactContext([
    user,
    call("1", "read", { path: "script.js" }),
    result("1", "whole file"),
    call("2", "read", { path: "script.js", offset: 2, limit: 1 }),
    result("2", "one line"),
  ]);
  assert.equal(compacted[2].content[0].text, "whole file");
  assert.equal(compacted[4].content[0].text, "one line");
});

test("failed edit proposals are omitted, but error results are retained", () => {
  const compacted = compactContext([
    user,
    call("1", "edit", {
      path: "script.js",
      edits: [{ oldText: "old", newText: "not saved" }],
    }),
    result("1", "Could not find edits[0]", true),
  ]);
  assert.equal(compacted[1].content[0].type, "text");
  assert.match(compacted[1].content[0].text, /NOT saved/);
  assert.equal(compacted[2].isError, true);
  assert.equal(compacted[2].content[0].text, "Could not find edits[0]");
});

test("edit failures include fresh disk contents and explicit all-or-nothing semantics", () => {
  for (const error of [
    "Could not find edits[0]",
    "edits[0] and edits[1] overlap",
    "No changes made to script.js",
  ]) {
    const messages = [
      user,
      call("1", "edit", {
        path: "/project/script.js",
        edits: [{ oldText: "old", newText: "proposed" }],
      }),
      { ...result("1", error, true), toolName: "edit" },
    ];
    const enriched = editFeedback({
      messages,
      workspaceFiles: { "script.js": "actual disk contents\n\n" },
    });
    assert.match(
      enriched.at(-1).content[1].text,
      /NONE.*actual disk contents\n\n/s,
    );
    assert.equal(
      messages.at(-1).content.length,
      1,
      "does not mutate the original tool result",
    );
  }
});

test("unknown edit failures do not falsely claim that nothing was written", () => {
  const messages = [
    user,
    call("1", "edit", { path: "script.js" }),
    { ...result("1", "Disk I/O error", true), toolName: "edit" },
  ];
  assert.deepEqual(
    editFeedback({ messages, workspaceFiles: { "script.js": "code" } }),
    messages,
  );
});
