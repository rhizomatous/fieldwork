import { compactContext, editFeedback } from "./inference-context.js";
import { PROJECT_FILES } from "./project-files.js";

export function inferenceRequest(context) {
  const tools = (context.tools || []).filter((tool) =>
    ["read", "edit", "write", "bash"].includes(tool.name),
  );
  const inspection = inspectCurrentTurn(context.messages || []);
  const schema = buildActionSchema(tools, inspection);
  const system = buildSystemPrompt(context.systemPrompt || "", tools);
  const transcript = compactContext(editFeedback(context));
  const messages = translateTranscript(transcript, system);
  return { messages, schema, tools };
}

function inspectCurrentTurn(transcript) {
  const lastUser = transcript.findLastIndex(
    (message) => message.role === "user",
  );
  const turn = transcript.slice(lastUser + 1);
  const reads = new Map();
  const inspected = new Set();
  for (const message of turn) {
    if (message.role === "assistant" && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (
          block.type === "toolCall" &&
          block.name === "read" &&
          !block.arguments.offset &&
          !block.arguments.limit
        ) {
          reads.set(block.id, block.arguments.path);
        }
      }
    }
    if (
      message.role === "toolResult" &&
      !message.isError &&
      reads.has(message.toolCallId)
    ) {
      const path = reads
        .get(message.toolCallId)
        .replace(/^(?:\.\/|\/project\/)/, "");
      if (PROJECT_FILES.includes(path)) {
        inspected.add(path);
      }
    }
  }
  return {
    unread: PROJECT_FILES.filter((file) => !inspected.has(file)),
    hasToolError: turn.some(
      (message) => message.role === "toolResult" && message.isError,
    ),
  };
}

function buildActionSchema(tools, { unread, hasToolError }) {
  const schema = {
    anyOf: [
      {
        type: "object",
        properties: { type: { const: "message" }, text: { type: "string" } },
        required: ["type", "text"],
        additionalProperties: false,
      },
      ...tools.map((tool) => ({
        type: "object",
        properties: {
          type: { const: "tool" },
          name: { const: tool.name },
          arguments: tool.parameters,
        },
        required: ["type", "name", "arguments"],
        additionalProperties: false,
      })),
    ],
  };

  // This workspace is three small, interdependent files. Inspect all of them
  // before changing any, so the model has the markup, behavior, and styling.
  if (
    unread.length &&
    !hasToolError &&
    tools.some((tool) => tool.name === "read")
  ) {
    schema.anyOf = schema.anyOf.filter(
      (branch) => branch.properties.name?.const === "read",
    );
    schema.anyOf[0].properties.arguments = {
      ...schema.anyOf[0].properties.arguments,
      properties: {
        ...schema.anyOf[0].properties.arguments.properties,
        path: { type: "string", enum: unread },
      },
    };
  }

  return schema;
}

function buildSystemPrompt(systemPrompt, tools) {
  return `${systemPrompt}
You control coding tools through JSON. Return exactly one JSON object per response.
First inspect all three app files. Use edit for small, targeted changes to existing files. Copy oldText from the actual file: use the shortest unique anchor, preserving whitespace. Reserve write for creating new files or an explicitly requested full replacement.
Complete the ENTIRE requested feature in this turn, including markup and behavior. For a new UI control, add its own event handler; keep existing controls and their handlers working. Preserve unrelated content, layout, and styles.
After an edit, review the actual diff and continue with remaining changes. A successful edit to one file is not necessarily a complete feature. Never finish with work still left to do.
Protocol examples (not executed actions):
Read: {"type":"tool","name":"read","arguments":{"path":"index.html"}}
Edit: {"type":"tool","name":"edit","arguments":{"path":"index.html","edits":[{"oldText":"exact unique existing text","newText":"replacement text"}]}}
Finish: {"type":"message","text":"What you completed"}
After each tool call you receive its result. A failed exact-match edit applies NONE of its replacements. Use the actual current file, not the failed proposal, for the next edit.
Available tools: ${JSON.stringify(tools)}`;
}

function translateTranscript(transcript, system) {
  const messages = [{ role: "system", content: system }];

  for (const message of transcript) {
    let content;

    if (typeof message.content === "string") {
      content = message.content;
    } else {
      content = (message.content || [])
        .map((block) => {
          if (block.type === "text") {
            return block.text;
          }
          if (block.type === "toolCall") {
            return JSON.stringify({
              type: "tool",
              name: block.name,
              arguments: block.arguments,
            });
          }
          return "";
        })
        .join("\n");
    }

    if (message.role === "toolResult") {
      if (message.details?.diff && !message.isError) {
        content += `\nActual diff (line numbers and +/- markers are not file contents):\n${message.details.diff}`;
      }
      content = `Tool result (${message.toolName}, ${message.isError ? "error" : "success"}):\n${content}`;
    }

    const role = message.role === "assistant" ? "assistant" : "user";

    // Merge adjacent roles for chat templates that require alternation.
    if (messages.at(-1)?.role === role) {
      messages.at(-1).content += "\n\n" + content;
    } else {
      messages.push({ role, content });
    }
  }

  return messages;
}

export function parseAction(text, tools) {
  // WebLLM includes this empty Qwen prefix when enable_thinking is false.
  const action = JSON.parse(text.replace(/^<think>\s*<\/think>\s*/, ""));

  if (action.type === "message" && typeof action.text === "string") {
    return action;
  }

  if (
    action.type !== "tool" ||
    !tools.some((tool) => tool.name === action.name)
  ) {
    throw new Error("The model returned an unknown action.");
  }

  if (
    !action.arguments ||
    typeof action.arguments !== "object" ||
    Array.isArray(action.arguments)
  ) {
    throw new Error("The model returned invalid tool arguments.");
  }

  return action;
}
