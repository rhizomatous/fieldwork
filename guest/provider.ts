import { randomUUID } from "node:crypto";
import fs from "node:fs";

import { createAssistantMessageEventStream } from "@mariozechner/pi-ai";
import type {
  AssistantMessage,
  ToolCall,
  StreamFunction,
} from "@mariozechner/pi-ai";
import type { ProviderConfig } from "@mariozechner/pi-coding-agent";

import {
  inferenceRequestSchema,
  parseInferenceResult,
} from "../shared/contracts.ts";
import type { InferenceResult } from "../shared/contracts.ts";
import { errorMessage, isMissingFile } from "../shared/errors.ts";
import { INFERENCE_LIMITS } from "../shared/inference-config.ts";

export type BrowserProviderConfig = Required<
  Pick<ProviderConfig, "baseUrl" | "api" | "models">
> & { streamSimple: StreamFunction };
interface ProviderHost {
  on(name: "agent_start", handler: () => void): void;
  registerProvider(name: "browser", provider: BrowserProviderConfig): void;
}

const dir = process.env.BRIDGE_DIR || "/bridge";
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function browserProvider(pi: ProviderHost) {
  let rounds = 0;

  pi.on("agent_start", () => {
    rounds = 0;
  });

  pi.registerProvider("browser", {
    baseUrl: "http://browser.invalid",
    api: "browser-local",
    models: [
      {
        id: "local",
        name: "Browser WebGPU",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: INFERENCE_LIMITS.contextTokens,
        maxTokens: INFERENCE_LIMITS.maxOutputTokens,
      },
    ],
    streamSimple(model, context, options) {
      const stream = createAssistantMessageEventStream();
      const id = randomUUID();
      const responsePath = `${dir}/response-${id}.json`;
      const output: AssistantMessage = {
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
            JSON.stringify(inferenceRequestSchema.parse({ id, context })),
          );
          fs.renameSync(`${dir}/request.tmp`, `${dir}/request.json`);

          const deadline = Date.now() + 240_000;
          let response: InferenceResult | undefined;

          while (Date.now() < deadline) {
            if (options?.signal?.aborted) {
              throw new Error("Stopped");
            }

            try {
              response = parseInferenceResult(
                JSON.parse(fs.readFileSync(responsePath, "utf8")),
                id,
              );
              break;
            } catch (error) {
              if (!isMissingFile(error)) {
                throw error;
              }
            }

            await pause(100);
          }

          if (!response) {
            throw new Error("Local inference timed out");
          }

          if (response.error !== undefined) {
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

            const block: ToolCall = {
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
            reason: action.type === "tool" ? "toolUse" : "stop",
            message: output,
          });
        } catch (error) {
          output.stopReason = options?.signal?.aborted ? "aborted" : "error";
          output.errorMessage = errorMessage(error);

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
