import type { MLCEngine } from "@mlc-ai/web-llm";
import { CreateMLCEngine } from "@mlc-ai/web-llm";

import { workerRequestSchema } from "../../shared/contracts.ts";
import type {
  InferenceRequest,
  WorkerMessage,
  WorkerRequest,
} from "../../shared/contracts.ts";
import { errorMessage } from "../../shared/errors.ts";
import { INFERENCE_LIMITS } from "../../shared/inference-config.ts";

import { gpuSupportError } from "./gpu-support.ts";
import { inferenceRequest, parseAction } from "./protocol.ts";

let engine: MLCEngine | undefined;
let cancelled = false;
let generating = false;
const send = (message: WorkerMessage) => postMessage(message);
self.onmessage = ({ data: value }: MessageEvent<unknown>) => {
  const parsed = workerRequestSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `Invalid inference worker request: ${parsed.error.message}`,
    );
  }
  void handleRequest(parsed.data);
};

async function handleRequest(data: WorkerRequest) {
  if (data.type === "cancel") {
    cancelled = true;
    await engine?.interruptGenerate();
    return;
  }
  if (data.type === "load") {
    return loadModel(data.model);
  }
  return generate(data);
}

async function loadModel(model: string) {
  try {
    const adapter = await navigator.gpu?.requestAdapter({
      powerPreference: "high-performance",
    });
    const compatibilityError = gpuSupportError(adapter);

    if (compatibilityError) {
      throw new Error(compatibilityError);
    }

    await engine?.unload();

    engine = await CreateMLCEngine(
      model,
      {
        initProgressCallback: (progress) =>
          send({
            type: "progress",
            progress: progress.progress,
            text: progress.text,
          }),
      },
      { context_window_size: INFERENCE_LIMITS.contextTokens },
    );
    send({ type: "loaded" });
  } catch (error) {
    engine = undefined;
    send({ type: "load-error", error: errorMessage(error) });
  }
}

async function generate(data: InferenceRequest) {
  if (!engine || generating) {
    send({ type: "result", id: data.id, error: "The model is not ready." });
    return;
  }
  generating = true;
  cancelled = false;
  let text = "";
  let usage;
  let finishReason;
  try {
    const { messages, schema, tools } = inferenceRequest(data.context);
    const chunks = await engine.chat.completions.create({
      messages,
      temperature: 0.1,
      extra_body: { enable_thinking: false },
      max_tokens: INFERENCE_LIMITS.maxOutputTokens,
      stream: true,
      stream_options: { include_usage: true },
      response_format: { type: "json_object", schema: JSON.stringify(schema) },
    });
    for await (const chunk of chunks) {
      if (cancelled) {
        throw new Error("Stopped");
      }
      finishReason = chunk.choices[0]?.finish_reason || finishReason;
      text += chunk.choices[0]?.delta.content || "";
      if (chunk.usage) {
        usage = chunk.usage;
      }
    }
    if (cancelled) {
      throw new Error("Stopped");
    }
    if (finishReason === "length") {
      throw new Error(
        "The model response was too long and was not executed. Try a smaller change.",
      );
    }
    const action = parseAction(text, tools);
    send({
      type: "result",
      id: data.id,
      action,
      usage: {
        input: usage?.prompt_tokens || 0,
        output: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0,
      },
      metrics: usage?.extra,
    });
  } catch (error) {
    send({ type: "result", id: data.id, error: errorMessage(error) });
  } finally {
    generating = false;
  }
}
