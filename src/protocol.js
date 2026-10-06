export const PROJECT_FILES = ["index.html", "style.css", "script.js"];

export function inferenceRequest(context) {
  const tools = (context.tools || []).filter((t) =>
    ["read", "write", "edit", "bash"].includes(t.name),
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
  const transcript = context.messages || [];
  const lastUser = transcript.findLastIndex(
    (message) => message.role === "user",
  );
  const hasInspected = transcript
    .slice(lastUser + 1)
    .some((message) => message.role === "toolResult");

  // Small models otherwise sometimes answer an edit request without inspecting
  // or changing anything. The first action in each turn must inspect a file.
  if (!hasInspected && tools.some((tool) => tool.name === "read")) {
    schema.anyOf = schema.anyOf.filter(
      (branch) => branch.properties.name?.const === "read",
    );
  }

  const system = `${context.systemPrompt || ""}\nYou control the coding tools through JSON. Return exactly one JSON object per response. First use read to inspect the relevant file. Then perform the requested change using edit or write. Only finish after a successful edit, or explain why you cannot make it.\nProtocol examples, not executed actions:\nRead: {"type":"tool","name":"read","arguments":{"path":"index.html"}}\nEdit: {"type":"tool","name":"edit","arguments":{"path":"index.html","edits":[{"oldText":"exact old text","newText":"replacement text"}]}}\nFinish: {"type":"message","text":"What you changed"}\nAfter each tool call you will receive its result. Never claim changes based on intent alone. Available tools:\n${JSON.stringify(tools)}`;
  const messages = [{ role: "system", content: system }];

  for (const message of context.messages || []) {
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

  return { messages, schema };
}

export function parseAction(text, tools) {
  const action = JSON.parse(text);

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
