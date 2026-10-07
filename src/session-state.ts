import { INFERENCE_LIMITS, MODEL } from "../shared/inference-config.ts";

import type {
  LinuxPhase,
  ModelPhase,
  SessionData,
  SessionState,
  Status,
} from "./types.ts";

const linuxDisplay: Record<
  LinuxPhase,
  { linuxStatus: Status; agentStatus: Status; bootLabel: string }
> = {
  off: {
    linuxStatus: { text: "Off", kind: "" },
    agentStatus: { text: "Not started", kind: "" },
    bootLabel: "Start Linux",
  },
  booting: {
    linuxStatus: { text: "Booting", kind: "busy" },
    agentStatus: { text: "Waiting", kind: "busy" },
    bootLabel: "Booting…",
  },
  starting: {
    linuxStatus: { text: "Running", kind: "ready" },
    agentStatus: { text: "Starting", kind: "busy" },
    bootLabel: "Booting…",
  },
  ready: {
    linuxStatus: { text: "Running", kind: "ready" },
    agentStatus: { text: "Ready", kind: "ready" },
    bootLabel: "Linux running",
  },
  "boot-error": {
    linuxStatus: { text: "Failed", kind: "error" },
    agentStatus: { text: "Boot failed", kind: "error" },
    bootLabel: "Reload to retry",
  },
  failed: {
    linuxStatus: { text: "Failed", kind: "error" },
    agentStatus: { text: "Failed", kind: "error" },
    bootLabel: "Reload to retry",
  },
};

const modelDisplay: Record<
  ModelPhase,
  { modelStatus: Status; loadLabel: string }
> = {
  unloaded: {
    modelStatus: { text: "Unloaded", kind: "" },
    loadLabel: "Load model",
  },
  loading: {
    modelStatus: { text: "Loading", kind: "busy" },
    loadLabel: "Loading…",
  },
  ready: {
    modelStatus: { text: "Ready", kind: "ready" },
    loadLabel: "Reload model",
  },
  generating: {
    modelStatus: { text: "Generating", kind: "busy" },
    loadLabel: "Reload model",
  },
  "load-error": {
    modelStatus: { text: "Load failed", kind: "error" },
    loadLabel: "Retry model",
  },
  "worker-error": {
    modelStatus: { text: "Worker failed", kind: "error" },
    loadLabel: "Reload page",
  },
  unsupported: {
    modelStatus: { text: "Unsupported", kind: "error" },
    loadLabel: "Load model",
  },
};

function modelDetail(data: SessionData): string {
  switch (data.modelPhase) {
    case "unloaded":
      return `${MODEL.weightBits}-bit weights · ~${MODEL.estimatedGpuMemoryGB} GB estimated GPU memory · download on first use`;
    case "loading":
      return (
        data.progressMessage ||
        "Preparing model download. The first load can take a few minutes."
      );
    case "ready":
    case "generating":
      return `Model loaded locally · ${MODEL.weightBits}-bit weights · ${INFERENCE_LIMITS.contextTokens.toLocaleString("en-US")}-token context`;
    case "load-error":
    case "worker-error":
    case "unsupported":
      return data.modelError || "Model unavailable";
  }
}

// Called only when stored data changes, preserving useSyncExternalStore's snapshot identity.
export function deriveSessionState(data: SessionData): SessionState {
  const linux = linuxDisplay[data.linuxPhase];
  const model = modelDisplay[data.modelPhase];
  const linuxReady = data.linuxPhase === "ready";
  const modelReady =
    data.modelPhase === "ready" || data.modelPhase === "generating";
  const loading = data.modelPhase === "loading";
  const savingFile =
    data.operation.type === "saving" ? data.operation.file : null;
  const idle = data.operation.type === "idle";
  const busy = !idle && data.operation.type !== "saving";
  return {
    ...data,
    ...linux,
    ...model,
    loadDetail: modelDetail(data),
    linuxReady,
    modelReady,
    loading,
    savingFile,
    busy,
    bootStarted: data.linuxPhase !== "off",
    resettingChat: data.operation.type === "resetting-chat",
    agentStatus:
      data.operation.type === "working" && linuxReady
        ? { text: "Working", kind: "busy" }
        : linux.agentStatus,
    canSend: idle && linuxReady && modelReady,
    canLoadModel:
      !busy &&
      !loading &&
      data.gpuAvailable &&
      data.modelPhase !== "worker-error",
    canResetChat: idle,
    canResetProject: idle && linuxReady,
    canStop:
      data.operation.type === "prompting" || data.operation.type === "working",
  };
}
