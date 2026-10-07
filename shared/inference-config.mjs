// Shared by the browser worker, UI, and bundled Linux guest.
export const INFERENCE_LIMITS = {
  contextTokens: 8192,
  maxOutputTokens: 2048,
};

export const models = [
  {
    id: "Qwen3.5-4B-q4f16_1-MLC",
    label: "Qwen3.5 4B",
    weightBits: 4,
    estimatedGpuMemoryGB: 3.9,
    url: "https://huggingface.co/Qwen/Qwen3.5-4B",
  },
];
