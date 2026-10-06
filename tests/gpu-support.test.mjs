import test from "node:test";
import assert from "node:assert/strict";
import { gpuSupportError } from "../src/gpu-support.js";

test("rejects the reported Firefox limit before engine initialization", () => {
  assert.match(
    gpuSupportError({ limits: { maxStorageBuffersPerShaderStage: 9 } }),
    /exposes 9.*requires 10/,
  );
});
test("accepts WebLLM storage buffer minimum and handles unavailable adapters", () => {
  assert.equal(
    gpuSupportError({ limits: { maxStorageBuffersPerShaderStage: 10 } }),
    null,
  );
  assert.match(gpuSupportError(null), /WebGPU is unavailable/);
});
