import { compactContext, editFeedback } from "./inference-context.js";
import { PROJECT_FILES } from "./project-files.js";

export function inferenceRequest(context) {
  const transcript = context.messages || [];
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
  const tools = (context.tools || []).filter((tool) =>
    ["read", "edit", "write", "bash"].includes(tool.name),
  );
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
  // A failed read still permits an explanation rather than forcing a loop.
  const unread = PROJECT_FILES.filter((file) => !inspected.has(file));
  const readFailed = turn.some(
    (message) => message.role === "toolResult" && message.isError,
  );
  if (
    unread.length &&
    !readFailed &&
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

  const system = `${context.systemPrompt || ""}
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
  const messages = [{ role: "system", content: system }];

  for (const message of compactContext(editFeedback(context))) {
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

  return { messages, schema, tools };
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

export function buildPreview(files, channel = "") {
  for (const file of PROJECT_FILES) {
    if (typeof files[file] !== "string") {
      throw new Error(`Missing ${file}`);
    }
  }

  // Only the initial three-file format is supported. JSON encoding prevents an
  // app script containing </script> from breaking out of its injected wrapper.
  const css = JSON.stringify(files["style.css"]).replace(/</g, "\\u003c");
  const js = JSON.stringify(files["script.js"]).replace(/</g, "\\u003c");
  const token = JSON.stringify(channel).replace(/</g, "\\u003c");
  const bootstrap = `<script>const channel=${token};addEventListener('error',e=>parent.postMessage({channel,type:'preview-error',message:e.message},'*'));addEventListener('unhandledrejection',e=>parent.postMessage({channel,type:'preview-error',message:String(e.reason)},'*'));</script>`;
  const style = `<script>{const s=document.createElement('style');s.textContent=${css};document.head.append(s)}</script>`;
  const script = `<script>{const s=document.createElement('script');s.textContent=${js};document.body.append(s)}</script>`;

  let html = files["index.html"];
  html = html.replace(
    /<link\b[^>]*href\s*=\s*["'](?:\.\/)?style\.css["'][^>]*>/gi,
    "",
  );
  html = html.replace(
    /<script\b[^>]*src\s*=\s*["'](?:\.\/)?script\.js["'][^>]*>\s*<\/script\s*>/gi,
    "",
  );

  // This demo has no external dependencies. Block network and nested frames.
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">`;
  const head = policy + bootstrap + style;

  html = /<head\b[^>]*>/i.test(html)
    ? html.replace(/<head\b[^>]*>/i, (match) => match + head)
    : head + html;

  return /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, script + "</body>")
    : html + script;
}
