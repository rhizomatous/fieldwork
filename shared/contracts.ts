import { z } from "zod";

// IDs become filenames on the bridge, so they must be a single safe component.
export const requestIdSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);
const commandInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("prompt"), message: z.string().min(1) }),
  z.object({ type: z.literal("abort") }),
  z.object({ type: z.literal("new_session") }),
]);
export const commandSchema = z.intersection(
  z.object({ id: requestIdSchema }),
  commandInputSchema,
);
export type Command = z.infer<typeof commandSchema>;
export type CommandInput = z.infer<typeof commandInputSchema>;

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message"), text: z.string() }),
  z.object({
    type: z.literal("tool"),
    name: z.string(),
    arguments: z.record(z.string(), z.unknown()),
  }),
]);
export type Action = z.infer<typeof actionSchema>;

const textBlockSchema = z.object({ type: z.literal("text"), text: z.string() });
const toolCallSchema = z.object({
  type: z.literal("toolCall"),
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
});
const contentBlockSchema = z.discriminatedUnion("type", [
  textBlockSchema,
  toolCallSchema,
  z.object({ type: z.literal("thinking"), thinking: z.string() }),
  z.object({
    type: z.literal("image"),
    data: z.string(),
    mimeType: z.string(),
  }),
]);
export type ToolCall = z.infer<typeof toolCallSchema>;
const transcriptMessageSchema = z.union([
  z.object({
    role: z.enum(["user", "assistant"]),
    content: z.union([z.string(), z.array(contentBlockSchema)]),
  }),
  z.object({
    role: z.literal("toolResult"),
    toolCallId: z.string(),
    toolName: z.string(),
    isError: z.boolean(),
    content: z.union([z.string(), z.array(contentBlockSchema)]),
    details: z.object({ diff: z.string().optional() }).optional(),
  }),
]);
export type TranscriptMessage = z.infer<typeof transcriptMessageSchema>;
const toolSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.looseObject({
    properties: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type InferenceTool = z.infer<typeof toolSchema>;
const inferenceContextSchema = z.object({
  systemPrompt: z.string().optional(),
  messages: z.array(transcriptMessageSchema),
  tools: z.array(toolSchema).optional(),
  workspaceFiles: z.record(z.string(), z.string()).optional(),
});
export type InferenceContext = z.infer<typeof inferenceContextSchema>;
export const inferenceRequestSchema = z.object({
  id: requestIdSchema,
  context: inferenceContextSchema,
});
export type InferenceRequest = z.infer<typeof inferenceRequestSchema>;
const resultFields = {
  id: requestIdSchema,
  usage: z
    .object({
      input: z.number().nonnegative(),
      output: z.number().nonnegative(),
      totalTokens: z.number().nonnegative(),
    })
    .optional(),
  metrics: z
    .object({ decode_tokens_per_s: z.number().nonnegative().optional() })
    .optional(),
};
const successSchema = z.object({
  ...resultFields,
  action: actionSchema,
  error: z.never().optional(),
});
const failureSchema = z.object({
  ...resultFields,
  error: z.string(),
  action: z.never().optional(),
});
export const inferenceResultSchema = z.union([successSchema, failureSchema]);
export type InferenceResult = z.infer<typeof inferenceResultSchema>;
export function parseInferenceResult(
  value: unknown,
  expectedId: string,
): InferenceResult {
  const result = inferenceResultSchema.parse(value);
  if (result.id !== expectedId) {
    throw new Error("Inference response ID does not match the request");
  }
  return result;
}

export const workerRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("load"), model: z.string() }),
  z.object({ type: z.literal("cancel") }),
  inferenceRequestSchema.extend({ type: z.literal("generate") }),
]);
export type WorkerRequest = z.infer<typeof workerRequestSchema>;
export const workerMessageSchema = z.union([
  z.object({
    type: z.literal("progress"),
    progress: z.number().min(0).max(1),
    text: z.string(),
  }),
  z.object({ type: z.literal("loaded") }),
  z.object({ type: z.literal("load-error"), error: z.string() }),
  z.object({
    type: z.literal("tokens"),
    id: requestIdSchema,
    firstToken: z.number().nonnegative().optional(),
    characters: z.number().int().nonnegative(),
  }),
  successSchema.extend({ type: z.literal("result") }),
  failureSchema.extend({ type: z.literal("result") }),
]);
export type WorkerMessage = z.infer<typeof workerMessageSchema>;

// Only the subset of Pi events consumed by the browser crosses this boundary.
const agentEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("boot"), message: z.string() }),
  z.object({ type: z.literal("diagnostic"), message: z.string() }),
  z.object({ type: z.literal("fatal"), message: z.string() }),
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("agent_start") }),
  z.object({ type: z.literal("agent_end") }),
  z.object({ type: z.literal("message_start") }),
  z.object({
    type: z.literal("tool_execution_start"),
    toolName: z.string(),
    args: z
      .object({ path: z.string().optional(), command: z.string().optional() })
      .optional(),
  }),
  z.object({
    type: z.literal("tool_execution_end"),
    isError: z.boolean(),
    result: z.object({ content: z.array(contentBlockSchema) }),
  }),
  z.object({
    type: z.literal("message_update"),
    assistantMessageEvent: z.object({
      type: z.string(),
      delta: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal("message_end"),
    message: z.object({ errorMessage: z.string().optional() }),
  }),
  z.object({
    type: z.literal("response"),
    id: requestIdSchema.optional(),
    success: z.boolean(),
    error: z.string().optional(),
  }),
]);
export type AgentEvent = z.infer<typeof agentEventSchema>;
const eventTypeSchema = z.object({ type: z.string() });
const consumedEvents = new Set<string>(
  agentEventSchema.options.map((schema) => schema.shape.type.value),
);
export function parseAgentEvent(value: unknown): AgentEvent | null {
  const { type } = eventTypeSchema.parse(value);
  if (!consumedEvents.has(type)) {
    return null;
  }
  return agentEventSchema.parse(value);
}
