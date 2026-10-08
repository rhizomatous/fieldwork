import type {
  InferenceContext,
  TranscriptMessage,
  ToolCall,
} from "../../shared/contracts.ts";

// Pi retains the complete conversation. The small browser model only needs
// recent dialogue and the current turn's unsuperseded file contents.
function textOf(message: TranscriptMessage) {
  if (typeof message.content === "string") {
    return message.content;
  }
  return (message.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

export function compactContext(
  transcript: TranscriptMessage[],
): TranscriptMessage[] {
  const lastUser = transcript.findLastIndex(
    (message) => message.role === "user",
  );
  if (lastUser < 0) {
    return transcript;
  }
  const previous = transcript
    .slice(0, lastUser)
    .filter(
      (message) =>
        message.role === "user" ||
        (message.role === "assistant" && textOf(message)),
    )
    .slice(-4)
    .map((message) => ({
      role:
        message.role === "user" ? ("user" as const) : ("assistant" as const),
      content: textOf(message).slice(0, 1000),
    }));
  const current = transcript.slice(lastUser);
  const calls = new Map<string | undefined, ToolCall & { index: number }>();
  const latest = new Map<unknown, string>();
  const successful = new Set<string>();
  const failed = new Set<string | undefined>();

  for (const [index, message] of current.entries()) {
    if (message.role === "assistant" && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.type === "toolCall") {
          calls.set(block.id, { ...block, index });
        }
      }
    }
    if (message.role !== "toolResult") {
      continue;
    }
    if (message.isError) {
      failed.add(message.toolCallId);
      continue;
    }
    const call = calls.get(message.toolCallId);
    if (call && ["read", "write"].includes(call.name)) {
      successful.add(call.id);
      // A partial read cannot supersede a complete file snapshot.
      if (
        call.name === "write" ||
        (!call.arguments.offset && !call.arguments.limit)
      ) {
        latest.set(call.arguments.path, call.id);
      }
    }
  }

  const compacted = current.map((message): TranscriptMessage => {
    if (message.role === "toolResult") {
      const call = calls.get(message.toolCallId);
      if (
        call?.name === "read" &&
        successful.has(call.id) &&
        (calls.get(latest.get(call.arguments.path))?.index ?? -1) > call.index
      ) {
        return {
          ...message,
          content: [
            {
              type: "text",
              text: `Earlier contents of ${call.arguments.path} omitted; a newer successful read or write follows.`,
            },
          ],
        };
      }
      return message;
    }
    if (message.role !== "assistant" || !Array.isArray(message.content)) {
      return message;
    }
    return {
      ...message,
      content: message.content.map((block) => {
        if (
          block.type === "toolCall" &&
          block.name === "edit" &&
          failed.has(block.id)
        ) {
          return {
            type: "text",
            text: `Attempted edit of ${block.arguments.path} failed. The proposed replacements were NOT saved; their contents are omitted to avoid confusing them with the real file.`,
          };
        }
        if (block.type !== "toolCall" || block.name !== "write") {
          return block;
        }
        if (
          !successful.has(block.id) ||
          latest.get(block.arguments.path) !== block.id
        ) {
          return {
            ...block,
            arguments: {
              ...block.arguments,
              content:
                "[Earlier proposed contents omitted. Use the latest successful read/write, or read the file again.]",
            },
          };
        }
        return block;
      }),
    };
  });
  return [...previous, ...compacted];
}

export function editFeedback(context: InferenceContext) {
  const messages = [...(context.messages || [])];
  const last = messages.at(-1);
  if (
    last?.role !== "toolResult" ||
    last.toolName !== "edit" ||
    !last.isError
  ) {
    return messages;
  }
  const error = textOf(last);
  const call = messages
    .flatMap((message) =>
      Array.isArray(message.content) ? message.content : [],
    )
    .find((block) => block.type === "toolCall" && block.id === last.toolCallId);
  const rawPath = call?.type === "toolCall" ? call.arguments.path : undefined;
  const path =
    typeof rawPath === "string"
      ? rawPath.replace(/^(?:\.\/|\/project\/)/, "")
      : undefined;
  const contents =
    path === undefined ? undefined : context.workspaceFiles?.[path];
  if (
    /Could not find|overlap|No changes made/.test(error) &&
    typeof contents === "string"
  ) {
    messages[messages.length - 1] = {
      ...last,
      content: [
        { type: "text", text: error },
        {
          type: "text",
          text: `NONE of this call's edits were applied. The proposed newText is not in the file. Make a smaller edit using a unique anchor copied exactly from the current contents below (including blank lines).\nCURRENT FILE ${path}, freshly read from disk:\n${contents}`,
        },
      ],
    };
  }
  return messages;
}
