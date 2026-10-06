import assert from "node:assert/strict";
import test from "node:test";

import {
  inferenceRequest,
  parseAction,
  buildPreview,
} from "../src/protocol.js";
import { starter } from "../src/starter.js";

const tools = [
  {
    name: "read",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
];
test("a fresh turn requires inspection before allowing a final response", () => {
  const request = inferenceRequest({
    tools,
    messages: [{ role: "user", content: "Change the title" }],
  });
  assert.equal(request.schema.anyOf.length, 1);
  assert.equal(request.schema.anyOf[0].properties.name.const, "read");
});
test("tool results remain paired with the assistant action and retain error state", () => {
  const result = inferenceRequest({
    tools,
    systemPrompt: "Edit the app.",
    messages: [
      { role: "user", content: "Read it." },
      {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            name: "read",
            arguments: { path: "missing.html" },
          },
        ],
      },
      {
        role: "toolResult",
        toolName: "read",
        isError: true,
        content: [{ type: "text", text: "File not found" }],
      },
    ],
  });
  assert.deepEqual(
    result.messages.map((m) => m.role),
    ["system", "user", "assistant", "user"],
  );
  assert.match(result.messages[3].content, /read, error.*\nFile not found/);
  assert.equal(
    result.schema.anyOf[1].properties.arguments,
    tools[0].parameters,
  );
});
test("unknown tools, incomplete JSON, and non-object arguments cannot execute", () => {
  assert.throws(() =>
    parseAction('{"type":"tool","name":"delete","arguments":{}}', tools),
  );
  assert.throws(() =>
    parseAction('{"type":"tool","name":"read","arguments":[]}', tools),
  );
  assert.throws(() => parseAction('{"type":"tool"', tools));
  assert.equal(
    parseAction('{"type":"message","text":"Done"}', tools).text,
    "Done",
  );
});
test("preview uses actual CSS and JS while safely encoding closing script tags", () => {
  const html = buildPreview(
    {
      ...starter,
      "script.js": 'document.title = "</script><h1>unexpected</h1>";',
    },
    "test",
  );
  assert.ok(!html.includes('src="script.js"'));
  assert.ok(!html.includes('href="style.css"'));
  assert.ok(!html.includes("</script><h1>unexpected"));
  assert.ok(html.includes("\\u003c/script>"));
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /const channel="test"/);
});
test("missing workspace files fail visibly instead of substituting starter content", () => {
  assert.throws(
    () => buildPreview({ "index.html": "<p>Broken</p>" }),
    /Missing style.css/,
  );
});
