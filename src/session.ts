import { INFERENCE_LIMITS, models } from "../shared/inference-config.mjs";

import { gpuSupportError } from "./gpu-support.js";
import { buildPreview } from "./preview.ts";
import type {
  AgentEvent,
  InferenceRequest,
  ProjectFile,
  ProjectFiles,
  Runtime,
  SessionState,
  Status,
  WorkerMessage,
} from "./types.ts";

const modelDetail = (id: string) => {
  const model = models.find((candidate) => candidate.id === id)!;
  return `${model.weightBits}-bit weights · ~${model.estimatedGpuMemoryGB} GB estimated GPU memory · download on first use`;
};
const status = (text: string, kind: Status["kind"] = ""): Status => ({
  text,
  kind,
});

// Owns one VM and one worker for the page lifetime. React only subscribes;
// mounting, unmounting, and Strict Mode never construct or restart either one.
export function createSession({
  runtime,
  worker,
  gpu = globalThis.navigator?.gpu,
}: {
  runtime: Runtime;
  worker: Worker;
  gpu?: GPU;
}) {
  const listeners = new Set<() => void>();
  let activeRequest: string | null = null;
  let turnChanged = false,
    assistantId: number | null = null,
    nextId = 0;
  let state: SessionState = {
    savingFile: null,
    linuxReady: false,
    linuxStatus: status("Off"),
    bootStarted: false,
    bootLabel: "Start Linux",
    modelReady: false,
    loading: false,
    busy: false,
    resettingChat: false,
    gpuAvailable: false,
    agentStatus: status("Not started"),
    modelStatus: status("Unloaded"),
    model: models[0].id,
    loadLabel: "Load model",
    loadDetail: modelDetail(models[0].id),
    progress: 0,
    gpuLabel: "Checking WebGPU…",
    storage: "Workspace awaiting Linux",
    messages: [],
    diagnostics: "",
    files: null,
    revision: 0,
    previewVersion: 0,
    ttft: "—",
    speed: "—",
    prefill: "—",
    inferenceNote: "No API key. No inference server.",
  };

  function update(patch: Partial<SessionState>) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  }

  function appendMessage(who: string, text: string, error = false) {
    const id = ++nextId;
    update({ messages: [...state.messages, { id, who, text, error }] });
    return id;
  }

  function appendDiagnostic(text: string) {
    update({ diagnostics: (state.diagnostics + text + "\n").slice(-24000) });
  }

  // Release the active request and restore idle statuses after completion or failure.
  function finishActiveOperation() {
    activeRequest = null;
    update({
      busy: false,
      agentStatus: status(
        state.linuxReady ? "Ready" : "Not started",
        state.linuxReady ? "ready" : "",
      ),
      modelStatus: status(
        state.modelReady ? "Ready" : "Unloaded",
        state.modelReady ? "ready" : "",
      ),
    });
  }

  function handleRuntimeFailure(text: string) {
    update({ linuxReady: false });
    finishActiveOperation();
    update({
      agentStatus: status("Failed", "error"),
      bootLabel: "Reload to retry",
    });
    appendMessage("WORKSPACE", text, true);
  }

  function handleAgentEvent(event: AgentEvent) {
    switch (event.type) {
      case "boot":
        appendDiagnostic(event.message);
        update({
          linuxStatus: status("Running", "ready"),
          agentStatus: status("Starting", "busy"),
        });
        break;
      case "ready":
        update({
          linuxReady: true,
          linuxStatus: status("Running", "ready"),
          agentStatus: status("Ready", "ready"),
          bootLabel: "Linux running",
        });
        break;
      case "diagnostic":
        appendDiagnostic(event.message);
        break;
      case "fatal":
        handleRuntimeFailure(
          event.message + ". Open the boot console for details.",
        );
        break;
      case "agent_start":
        turnChanged = false;
        assistantId = null;
        update({ busy: true, agentStatus: status("Working", "busy") });
        break;
      case "tool_execution_start":
        update({
          messages: [
            ...state.messages,
            {
              id: ++nextId,
              tool: event.toolName,
              text: (event.args?.path || event.args?.command || "").slice(
                0,
                160,
              ),
            },
          ],
        });
        break;
      case "tool_execution_end":
        if (event.isError) {
          appendMessage(
            "TOOL ERROR",
            (event.result?.content || [])
              .filter((x) => x.type === "text")
              .map((x) => x.text)
              .join("\n")
              .slice(0, 1600),
            true,
          );
        }
        break;
      case "message_start":
        assistantId = null;
        break;
      case "message_update":
        if (event.assistantMessageEvent?.type === "text_delta") {
          const delta = event.assistantMessageEvent.delta || "";
          assistantId ??= appendMessage("PI", "");
          update({
            messages: state.messages.map((item) =>
              item.id === assistantId
                ? {
                    ...item,
                    text: item.text + delta,
                  }
                : item,
            ),
          });
        }
        break;
      case "message_end":
        if (event.message?.errorMessage) {
          appendMessage("PI", event.message.errorMessage, true);
        }
        break;
      case "agent_end":
        if (!turnChanged) {
          appendMessage("WORKSPACE", "No app files changed in this turn.");
        }
        finishActiveOperation();
        break;
      case "response":
        if (event.success === false) {
          appendMessage("PI", event.error || "Command failed", true);
          finishActiveOperation();
        }
        break;
    }
  }

  function handleSnapshot(files: ProjectFiles) {
    if (JSON.stringify(files) !== JSON.stringify(state.files)) {
      if (state.busy) {
        turnChanged = true;
      }
      update({ files, revision: state.revision + 1 });
    }
  }

  async function handleInferenceRequest(request: InferenceRequest) {
    try {
      if (!state.modelReady) {
        await runtime.respond({
          id: request.id,
          error: "Load a local model before asking Pi to work.",
        });
        return;
      }
      activeRequest = request.id;
      update({ modelStatus: status("Generating", "busy") });
      worker.postMessage({ type: "generate", ...request });
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      appendMessage("BRIDGE", error.message, true);
      finishActiveOperation();
    }
  }

  async function handleWorkerMessage(data: WorkerMessage) {
    if (data.type === "progress") {
      update({ progress: data.progress || 0, loadDetail: data.text });
    }

    if (data.type === "loaded") {
      const model = models.find((candidate) => candidate.id === state.model)!;
      update({
        modelReady: true,
        loading: false,
        loadLabel: "Reload model",
        modelStatus: status("Ready", "ready"),
        loadDetail: `Model loaded locally · ${model.weightBits}-bit weights · ${INFERENCE_LIMITS.contextTokens.toLocaleString("en-US")}-token context`,
      });
    }

    if (data.type === "load-error") {
      update({
        modelReady: false,
        loading: false,
        modelStatus: status("Load failed", "error"),
        loadLabel: "Retry model",
        loadDetail: data.error,
      });
    }

    if (data.type === "tokens" && data.id === activeRequest) {
      update({
        ...(data.firstToken !== undefined
          ? { ttft: (data.firstToken / 1000).toFixed(1) }
          : {}),
        inferenceNote: `${data.characters.toLocaleString()} characters generated`,
      });
    }

    if (data.type === "result" && data.id === activeRequest) {
      const speed = data.metrics?.decode_tokens_per_s;
      update({
        ...(data.usage
          ? {
              prefill: data.usage.input.toLocaleString(),
              speed: Number.isFinite(speed) ? speed!.toFixed(1) : "—",
            }
          : {}),
        inferenceNote: data.error
          ? "Generation interrupted or failed"
          : "Inference completed on this device",
        modelStatus: status("Ready", "ready"),
      });
      try {
        await runtime.respond(data);
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        appendMessage("BRIDGE", error.message, true);
        finishActiveOperation();
      }
    }
  }

  function handleWorkerError(event: ErrorEvent) {
    const error = event.message || "Inference worker failed. Reload the page.";
    const request = activeRequest;

    update({
      modelReady: false,
      loading: false,
      loadDetail: error,
      loadLabel: "Reload page",
    });
    finishActiveOperation();
    update({ modelStatus: status("Worker failed", "error") });

    if (request) {
      runtime
        .respond({ id: request, error })
        .catch((bridgeError: Error) =>
          appendMessage("BRIDGE", bridgeError.message, true),
        );
    }
  }

  async function checkGPU() {
    try {
      const adapter = await gpu?.requestAdapter({
        powerPreference: "high-performance",
      });
      const compatibilityError = gpuSupportError(adapter);

      update({
        gpuAvailable: !compatibilityError,
        gpuLabel: adapter
          ? `WebGPU available${adapter.info?.architecture ? " · " + adapter.info.architecture : ""}`
          : "WebGPU unavailable",
        ...(compatibilityError
          ? {
              modelStatus: status("Unsupported", "error"),
              loadDetail: compatibilityError,
            }
          : {}),
      });
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      update({ gpuLabel: "WebGPU unavailable", loadDetail: error.message });
    }
  }

  async function boot(mount: HTMLElement) {
    if (state.bootStarted) {
      return;
    }
    update({
      bootStarted: true,
      linuxStatus: status("Booting", "busy"),
      bootLabel: "Booting…",
      agentStatus: status("Waiting", "busy"),
    });
    try {
      await runtime.boot(mount);
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      update({
        linuxStatus: status("Failed", "error"),
        agentStatus: status("Boot failed", "error"),
        bootLabel: "Reload to retry",
      });
      appendMessage("WORKSPACE", error.message, true);
      appendDiagnostic(error.stack || error.message);
    }
  }

  function load() {
    if (state.busy || state.loading || !state.gpuAvailable) {
      return;
    }
    update({
      modelReady: false,
      loading: true,
      progress: 0,
      modelStatus: status("Loading", "busy"),
      loadLabel: "Loading…",
      loadDetail:
        "Preparing model download. The first load can take a few minutes.",
    });
    worker.postMessage({ type: "load", model: state.model });
  }

  function selectModel(model: string) {
    if (state.busy || state.loading || !models.some((m) => m.id === model)) {
      return;
    }
    update({
      model,
      modelReady: false,
      modelStatus: status("Unloaded"),
      loadLabel: "Load model",
      loadDetail: modelDetail(model),
    });
  }

  async function send(text: string) {
    text = text.trim();
    if (
      !text ||
      state.busy ||
      state.savingFile ||
      !state.linuxReady ||
      !state.modelReady
    ) {
      return false;
    }
    update({ busy: true });
    appendMessage("YOU", text);
    try {
      await runtime.command("prompt", text);
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      appendMessage("WORKSPACE", error.message, true);
      finishActiveOperation();
    }
    return true;
  }

  async function stop() {
    if (!state.busy) {
      return;
    }
    worker.postMessage({ type: "cancel" });
    try {
      await runtime.command("abort");
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      appendMessage("WORKSPACE", error.message, true);
      finishActiveOperation();
    }
  }

  async function resetChat() {
    if (state.busy || state.resettingChat) {
      return;
    }
    update({ busy: true, resettingChat: true });
    try {
      if (state.linuxReady) {
        await runtime.command("new_session");
      }
      assistantId = null;
      activeRequest = null;
      turnChanged = false;
      update({ messages: [] });
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      appendMessage("WORKSPACE", error.message, true);
    } finally {
      update({ resettingChat: false });
      finishActiveOperation();
    }
  }

  async function saveFile(
    file: ProjectFile,
    content: string,
    expected: string,
  ) {
    if (!state.linuxReady || !state.files) {
      throw new Error("Start Linux before saving files.");
    }
    if (state.busy || state.savingFile) {
      throw new Error("Wait for the current operation before saving.");
    }
    if (state.files[file] !== expected) {
      throw new Error(
        "This file changed in the workspace. Reload it before saving.",
      );
    }
    update({ savingFile: file });
    try {
      const files = await runtime.saveFile(file, content, expected);
      update({ files, revision: state.revision + 1 });
    } finally {
      update({ savingFile: null });
    }
  }

  function refresh() {
    update({ previewVersion: state.previewVersion + 1 });
  }

  async function reset() {
    if (state.busy || state.savingFile || !state.linuxReady) {
      return;
    }
    update({ busy: true });
    try {
      await runtime.reset();
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      appendMessage("WORKSPACE", error.message, true);
    } finally {
      finishActiveOperation();
    }
  }

  function exportApp() {
    if (!state.files) {
      return;
    }
    const url = URL.createObjectURL(
      new Blob([buildPreview(state.files)], { type: "text/html" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "fieldwork-app.html";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  runtime.addEventListener("event", ({ detail }) => handleAgentEvent(detail));
  runtime.addEventListener("diagnostic", ({ detail }) =>
    appendDiagnostic(detail),
  );
  runtime.addEventListener("fatal", ({ detail }) =>
    handleRuntimeFailure(detail),
  );
  runtime.addEventListener("storage", ({ detail }) =>
    update({ storage: detail }),
  );
  runtime.addEventListener("snapshot", ({ detail }) => handleSnapshot(detail));
  runtime.addEventListener("inference", ({ detail }) =>
    handleInferenceRequest(detail),
  );
  worker.onmessage = ({ data }: MessageEvent<WorkerMessage>) =>
    handleWorkerMessage(data);
  worker.onerror = handleWorkerError;

  checkGPU();

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    boot,
    load,
    selectModel,
    send,
    stop,
    resetChat,
    saveFile,
    refresh,
    reset,
    exportApp,
  };
}
