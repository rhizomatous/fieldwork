import { actionSchema } from "../shared/contracts.ts";
import type {
  InferenceContext,
  InferenceTool,
  TranscriptMessage,
} from "../shared/contracts.ts";

import { compactContext, editFeedback } from "./inference-context.ts";
import { PROJECT_FILES } from "./project-files.ts";
import type { ProjectFile } from "./types.ts";

export function inferenceRequest(context: InferenceContext) {
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

function inspectCurrentTurn(transcript: TranscriptMessage[]) {
  const lastUser = transcript.findLastIndex(
    (message) => message.role === "user",
  );
  const turn = transcript.slice(lastUser + 1);
  const reads = new Map<string, string>();
  const inspected = new Set<string>();
  for (const message of turn) {
    if (message.role === "assistant" && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (
          block.type === "toolCall" &&
          block.name === "read" &&
          !block.arguments.offset &&
          !block.arguments.limit &&
          typeof block.arguments.path === "string"
        ) {
          reads.set(block.id, block.arguments.path);
        }
      }
    }
    if (
      message.role === "toolResult" &&
      !message.isError &&
      message.toolCallId &&
      reads.has(message.toolCallId)
    ) {
      const path = reads
        .get(message.toolCallId)!
        .replace(/^(?:\.\/|\/project\/)/, "");
      if (PROJECT_FILES.includes(path as ProjectFile)) {
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

type ActionBranch = {
  type: "object";
  properties: {
    type: { const: "message" | "tool" };
    name?: { const: string };
    arguments?: InferenceTool["parameters"];
    text?: { type: "string" };
  };
  required: string[];
  additionalProperties: false;
};

function buildActionSchema(
  tools: InferenceTool[],
  { unread, hasToolError }: ReturnType<typeof inspectCurrentTurn>,
) {
  const schema: { anyOf: ActionBranch[] } = {
    anyOf: [
      {
        type: "object",
        properties: { type: { const: "message" }, text: { type: "string" } },
        required: ["type", "text"],
        additionalProperties: false,
      },
      ...tools.map((tool): ActionBranch => ({
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
        ...schema.anyOf[0].properties.arguments?.properties,
        path: { type: "string", enum: unread },
      },
    };
  }

  return schema;
}

function buildSystemPrompt(systemPrompt: string, tools: InferenceTool[]) {
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

function translateTranscript(transcript: TranscriptMessage[], system: string) {
  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [{ role: "system", content: system }];

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
      messages.at(-1)!.content += "\n\n" + content;
    } else {
      messages.push({ role, content });
    }
  }

  return messages;
}

export function parseAction(text: string, tools: InferenceTool[]) {
  // WebLLM includes this empty Qwen prefix when enable_thinking is false.
  const action = actionSchema.parse(
    JSON.parse(text.replace(/^<think>\s*<\/think>\s*/, "")),
  );
  if (
    action.type === "tool" &&
    !tools.some((tool) => tool.name === action.name)
  ) {
    throw new Error("The model returned an unknown action.");
  }
  return action;
}
