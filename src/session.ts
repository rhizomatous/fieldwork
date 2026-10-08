import { workerMessageSchema } from "../shared/contracts.ts";
import { MODEL } from "../shared/inference-config.ts";

import { gpuSupportError } from "./inference/gpu-support.ts";
import { deriveSessionState } from "./session-state.ts";
import type {
  AgentEvent,
  InferenceRequest,
  InferenceWorker,
  ProjectFile,
  ProjectFiles,
  Runtime,
  SessionData,
  WorkerMessage,
} from "./types.ts";
import { buildPreview } from "./workspace/preview.ts";

// Owns one VM and one worker for the page lifetime. React only subscribes;
// mounting, unmounting, and Strict Mode never construct or restart either one.
export function createSession({
  runtime,
  worker,
  gpu = globalThis.navigator?.gpu,
}: {
  runtime: Runtime;
  worker: InferenceWorker;
  gpu?: GPU;
}) {
  const listeners = new Set<() => void>();
  let activeRequest: string | null = null;
  let turnChanged = false,
    assistantId: number | null = null,
    nextId = 0;
  let sessionData: SessionData = {
    linuxPhase: "off",
    modelPhase: "unloaded",
    operation: { type: "idle" },
    gpuAvailable: false,
    modelError: null,
    progressMessage: "",
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

  let state = deriveSessionState(sessionData);

  function update(patch: Partial<SessionData>) {
    sessionData = { ...sessionData, ...patch };
    state = deriveSessionState(sessionData);
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

  function finishActiveOperation() {
    activeRequest = null;
    update({
      operation:
        state.operation.type === "saving" ? state.operation : { type: "idle" },
      modelPhase:
        state.modelPhase === "generating" ? "ready" : state.modelPhase,
    });
  }

  function handleRuntimeFailure(text: string) {
    update({ linuxPhase: "failed" });
    finishActiveOperation();
    appendMessage("WORKSPACE", text, true);
  }

  function handleAgentEvent(event: AgentEvent) {
    switch (event.type) {
      case "boot":
        appendDiagnostic(event.message);
        update({ linuxPhase: "starting" });
        break;
      case "ready":
        update({ linuxPhase: "ready" });
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
        update({ operation: { type: "working" } });
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
      update({ modelPhase: "generating" });
      worker.postMessage({ type: "generate", ...request });
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      appendMessage("BRIDGE", error.message, true);
      finishActiveOperation();
    }
  }

  async function handleWorkerMessage(data: WorkerMessage) {
    if (data.type === "progress" && state.loading) {
      update({ progress: data.progress || 0, progressMessage: data.text });
    }

    if (data.type === "loaded") {
      update({ modelPhase: "ready" });
    }

    if (data.type === "load-error") {
      update({ modelPhase: "load-error", modelError: data.error });
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
      activeRequest = null;
      const speed = data.metrics?.decode_tokens_per_s;
      update({
        ...(data.usage
          ? {
              prefill: data.usage.input.toLocaleString(),
              speed: Number.isFinite(speed) ? speed!.toFixed(1) : "—",
            }
          : {}),
        modelPhase: "ready",
        inferenceNote: data.error
          ? "Generation interrupted or failed"
          : "Inference completed on this device",
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

  function handleWorkerError(event: Pick<ErrorEvent, "message">) {
    const error = event.message || "Inference worker failed. Reload the page.";
    const request = activeRequest;

    update({ modelPhase: "worker-error", modelError: error });
    finishActiveOperation();

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
              modelPhase: "unsupported" as const,
              modelError: compatibilityError,
            }
          : {}),
      });
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      update({
        modelPhase: "unsupported",
        gpuAvailable: false,
        gpuLabel: "WebGPU unavailable",
        modelError: error.message,
      });
    }
  }

  async function boot(mount: HTMLElement) {
    if (state.bootStarted) {
      return;
    }
    update({ linuxPhase: "booting" });
    try {
      await runtime.boot(mount);
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      update({ linuxPhase: "boot-error" });
      appendMessage("WORKSPACE", error.message, true);
      appendDiagnostic(error.stack || error.message);
    }
  }

  function load() {
    if (!state.canLoadModel) {
      return;
    }
    update({
      modelPhase: "loading",
      progress: 0,
      progressMessage: "",
      modelError: null,
    });
    worker.postMessage({ type: "load", model: MODEL.id });
  }

  async function send(text: string) {
    text = text.trim();
    if (!text || !state.canSend) {
      return false;
    }
    update({ operation: { type: "prompting" } });
    appendMessage("YOU", text);
    try {
      await runtime.command({ type: "prompt", message: text });
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      appendMessage("WORKSPACE", error.message, true);
      finishActiveOperation();
    }
    return true;
  }

  async function stop() {
    if (!state.canStop) {
      return;
    }
    worker.postMessage({ type: "cancel" });
    try {
      await runtime.command({ type: "abort" });
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      appendMessage("WORKSPACE", error.message, true);
      finishActiveOperation();
    }
  }

  async function resetChat() {
    if (!state.canResetChat) {
      return;
    }
    update({ operation: { type: "resetting-chat" } });
    try {
      if (state.linuxReady) {
        await runtime.command({ type: "new_session" });
      }
      assistantId = null;
      activeRequest = null;
      turnChanged = false;
      update({ messages: [] });
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      appendMessage("WORKSPACE", error.message, true);
    } finally {
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
    update({ operation: { type: "saving", file } });
    try {
      const files = await runtime.saveFile(file, content, expected);
      update({ files, revision: state.revision + 1 });
    } finally {
      update({ operation: { type: "idle" } });
    }
  }

  function refresh() {
    update({ previewVersion: state.previewVersion + 1 });
  }

  async function reset() {
    if (!state.canResetProject) {
      return;
    }
    update({ operation: { type: "resetting-project" } });
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
  worker.onmessage = ({ data }) => {
    const parsed = workerMessageSchema.safeParse(data);
    if (!parsed.success) {
      handleWorkerError({
        message: `Invalid inference worker message: ${parsed.error.message}`,
      });
      return;
    }
    return handleWorkerMessage(parsed.data);
  };
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
    send,
    stop,
    resetChat,
    saveFile,
    refresh,
    reset,
    exportApp,
  };
}
