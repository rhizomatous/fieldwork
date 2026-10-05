import { CreateMLCEngine } from "@mlc-ai/web-llm";
import { inferenceRequest, parseAction } from "./protocol.js";
let engine;
let cancelled = false;
let generating = false;
const send = (type, data = {}) => postMessage({ type, ...data });
self.onmessage = async ({ data }) => {
  if (data.type === "cancel") {
    cancelled = true;
    await engine?.interruptGenerate();
    return;
  }
  if (data.type === "load") {
    try {
      await engine?.unload();
      engine = await CreateMLCEngine(
        data.model,
        { initProgressCallback: (progress) => send("progress", progress) },
        { context_window_size: 4096 },
      );
      send("loaded", { model: data.model });
    } catch (error) {
      engine = undefined;
      send("load-error", { error: error.message });
    }
    return;
  }
  if (data.type !== "generate") return;
  if (!engine || generating) {
    send("result", { id: data.id, error: "The model is not ready." });
    return;
  }
  generating = true;
  cancelled = false;
  const start = performance.now();
  let firstToken;
  let text = "";
  let usage;
  try {
    const { messages, schema } = inferenceRequest(data.context);
    const chunks = await engine.chat.completions.create({
      messages,
      temperature: 0.1,
      max_tokens: 1536,
      stream: true,
      stream_options: { include_usage: true },
      response_format: { type: "json_object", schema: JSON.stringify(schema) },
    });
    for await (const chunk of chunks) {
      if (cancelled) throw new Error("Stopped");
      const delta = chunk.choices[0]?.delta.content || "";
      if (delta && firstToken === undefined)
        firstToken = performance.now() - start;
      text += delta;
      if (chunk.usage) usage = chunk.usage;
      send("tokens", {
        id: data.id,
        characters: text.length,
        firstToken,
        elapsed: performance.now() - start,
      });
    }
    if (cancelled) throw new Error("Stopped");
    const action = parseAction(text, data.context.tools || []);
    send("result", {
      id: data.id,
      action,
      elapsed: performance.now() - start,
      firstToken,
      usage: {
        input: usage?.prompt_tokens || 0,
        output: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0,
      },
      metrics: usage?.extra,
    });
  } catch (error) {
    send("result", { id: data.id, error: error.message });
  } finally {
    generating = false;
  }
};
