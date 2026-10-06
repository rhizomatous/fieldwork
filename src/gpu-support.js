// Matches the device requirement in the pinned WebLLM 0.2.85 runtime.
export function gpuSupportError(adapter) {
  if (!adapter) {
    return "WebGPU is unavailable. Open in a desktop browser with hardware acceleration enabled.";
  }

  const limit = adapter.limits.maxStorageBuffersPerShaderStage;

  if (limit < 10) {
    return `This browser exposes ${limit} GPU storage buffers per shader stage. WebLLM requires 10. Try an up-to-date Chrome.`;
  }

  return null;
}
