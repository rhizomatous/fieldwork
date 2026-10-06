import { randomUUID } from "node:crypto";
import fs from "node:fs";

import { createAssistantMessageEventStream } from "@mariozechner/pi-ai";

const dir = process.env.BRIDGE_DIR || "/bridge";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function browserProvider(pi) {
  let rounds = 0;

  pi.on("agent_start", () => {
    rounds = 0;
  });

  pi.registerProvider("browser", {
    baseUrl: "http://browser.invalid",
    apiKey: "local-only",
    api: "browser-local",
    models: [
      {
        id: "local",
        name: "Browser WebGPU",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 4096,
        maxTokens: 1536,
      },
    ],
    streamSimple(model, context, options) {
      const stream = createAssistantMessageEventStream();
      const id = randomUUID();
      const responsePath = `${dir}/response-${id}.json`;
      const output = {
        role: "assistant",
        content: [],
        api: model.api,
        provider: model.provider,
        model: model.id,
        timestamp: Date.now(),
        stopReason: "stop",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      (async () => {
        try {
          if (++rounds > 10) {
            throw new Error(
              "Stopped after 10 model calls. Try a smaller change.",
            );
          }

          if (options?.signal?.aborted) {
            throw new Error("Stopped");
          }

          stream.push({ type: "start", partial: output });
          fs.writeFileSync(
            `${dir}/request.tmp`,
            JSON.stringify({ id, context }),
          );
          fs.renameSync(`${dir}/request.tmp`, `${dir}/request.json`);

          const deadline = Date.now() + 240_000;
          let response;

          while (Date.now() < deadline) {
            if (options?.signal?.aborted) {
              throw new Error("Stopped");
            }

            try {
              response = JSON.parse(fs.readFileSync(responsePath, "utf8"));
              break;
            } catch (error) {
              if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) {
                throw error;
              }
            }

            await pause(100);
          }

          if (!response) {
            throw new Error("Local inference timed out");
          }

          if (response.error) {
            throw new Error(response.error);
          }

          if (response.usage) {
            Object.assign(output.usage, response.usage);
          }

          const action = response.action;

          if (action.type === "tool") {
            if (!context.tools?.some((tool) => tool.name === action.name)) {
              throw new Error("Unknown tool requested");
            }

            const block = {
              type: "toolCall",
              id,
              name: action.name,
              arguments: action.arguments,
            };

            output.content.push(block);
            output.stopReason = "toolUse";

            stream.push({
              type: "toolcall_start",
              contentIndex: 0,
              partial: output,
            });
            stream.push({
              type: "toolcall_delta",
              contentIndex: 0,
              delta: JSON.stringify(action.arguments),
              partial: output,
            });
            stream.push({
              type: "toolcall_end",
              contentIndex: 0,
              toolCall: block,
              partial: output,
            });
          } else if (
            action.type === "message" &&
            typeof action.text === "string"
          ) {
            output.content.push({ type: "text", text: action.text });

            stream.push({
              type: "text_start",
              contentIndex: 0,
              partial: output,
            });
            stream.push({
              type: "text_delta",
              contentIndex: 0,
              delta: action.text,
              partial: output,
            });
            stream.push({
              type: "text_end",
              contentIndex: 0,
              content: action.text,
              partial: output,
            });
          } else {
            throw new Error("Invalid model action");
          }
          stream.push({
            type: "done",
            reason: output.stopReason,
            message: output,
          });
        } catch (error) {
          output.stopReason = options?.signal?.aborted ? "aborted" : "error";
          output.errorMessage = error.message;

          stream.push({
            type: "error",
            reason: output.stopReason,
            error: output,
          });
        } finally {
          try {
            fs.unlinkSync(responsePath);
          } catch {}

          stream.end();
        }
      })();

      return stream;
    },
  });
}
