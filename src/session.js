import { buildPreview } from "./protocol.js";

export const models = [
  {
    id: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 Coder · 1.5B",
    memory: "1.6",
  },
  {
    id: "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 Coder · 3B",
    memory: "2.5",
  },
  { id: "Qwen3-4B-q4f16_1-MLC", label: "Qwen3 · 4B", memory: "3.4" },
];
const modelDetail = (id) =>
  `4-bit weights · ~${models.find((m) => m.id === id).memory} GB estimated GPU memory · download on first use`;
const status = (text, kind = "") => ({ text, kind });

// Owns one VM and one worker for the page lifetime. React only subscribes;
// mounting, unmounting, and Strict Mode never construct or restart either one.
export function createSession({
  runtime,
  worker,
  gpu = globalThis.navigator?.gpu,
}) {
  const listeners = new Set();
  let activeRequest = null,
    turnChanged = false,
    assistantId = null,
    nextId = 0;
  let state = {
    linuxReady: false,
    bootStarted: false,
    bootLabel: "Start Linux",
    modelReady: false,
    loading: false,
    busy: false,
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
  function update(patch) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  }
  function message(who, text, error = false) {
    const id = ++nextId;
    update({ messages: [...state.messages, { id, who, text, error }] });
    return id;
  }
  function diagnostic(text) {
    update({ diagnostics: (state.diagnostics + text + "\n").slice(-24000) });
  }
  function done() {
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
  function fatal(text) {
    update({ linuxReady: false });
    done();
    update({
      agentStatus: status("Failed", "error"),
      bootLabel: "Reload to retry",
    });
    message("WORKSPACE", text, true);
  }
  runtime.addEventListener("event", ({ detail: event }) => {
    switch (event.type) {
      case "boot":
        diagnostic(event.message);
        update({ agentStatus: status("Starting Pi", "busy") });
        break;
      case "ready":
        update({
          linuxReady: true,
          agentStatus: status("Ready", "ready"),
          bootLabel: "Linux running",
        });
        message(
          "WORKSPACE",
          "Pi is ready. The preview now reads the files inside Linux.",
        );
        break;
      case "diagnostic":
        diagnostic(event.message);
        break;
      case "fatal":
        fatal(event.message + ". Open the boot console for details.");
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
        if (event.isError)
          message(
            "TOOL ERROR",
            (event.result?.content || [])
              .filter((x) => x.type === "text")
              .map((x) => x.text)
              .join("\n")
              .slice(0, 1600),
            true,
          );
        break;
      case "message_start":
        assistantId = null;
        break;
      case "message_update":
        if (event.assistantMessageEvent?.type === "text_delta") {
          assistantId ??= message("PI", "");
          update({
            messages: state.messages.map((item) =>
              item.id === assistantId
                ? {
                    ...item,
                    text: item.text + event.assistantMessageEvent.delta,
                  }
                : item,
            ),
          });
        }
        break;
      case "message_end":
        if (event.message?.errorMessage)
          message("PI", event.message.errorMessage, true);
        break;
      case "agent_end":
        if (!turnChanged)
          message("WORKSPACE", "No app files changed in this turn.");
        done();
        break;
      case "response":
        if (event.success === false) {
          message("PI", event.error || "Command failed", true);
          done();
        }
        break;
    }
  });
  runtime.addEventListener("diagnostic", ({ detail }) => diagnostic(detail));
  runtime.addEventListener("fatal", ({ detail }) => fatal(detail));
  runtime.addEventListener("storage", ({ detail }) =>
    update({ storage: detail }),
  );
  runtime.addEventListener("snapshot", ({ detail }) => {
    if (JSON.stringify(detail) !== JSON.stringify(state.files)) {
      if (state.busy) turnChanged = true;
      update({ files: detail, revision: state.revision + 1 });
    }
  });
  runtime.addEventListener("inference", async ({ detail }) => {
    try {
      if (!state.modelReady) {
        await runtime.respond({
          id: detail.id,
          error: "Load a local model before asking Pi to work.",
        });
        return;
      }
      activeRequest = detail.id;
      update({ modelStatus: status("Generating", "busy") });
      worker.postMessage({ type: "generate", ...detail });
    } catch (error) {
      message("BRIDGE", error.message, true);
      done();
    }
  });
  worker.onmessage = async ({ data }) => {
    if (data.type === "progress")
      update({ progress: data.progress || 0, loadDetail: data.text });
    if (data.type === "loaded")
      update({
        modelReady: true,
        loading: false,
        loadLabel: "Reload model",
        modelStatus: status("Ready", "ready"),
        loadDetail:
          "Model loaded locally · 4-bit weights · 4,096-token context",
      });
    if (data.type === "load-error")
      update({
        modelReady: false,
        loading: false,
        modelStatus: status("Load failed", "error"),
        loadLabel: "Retry model",
        loadDetail: data.error,
      });
    if (data.type === "tokens" && data.id === activeRequest)
      update({
        ...(data.firstToken !== undefined
          ? { ttft: (data.firstToken / 1000).toFixed(1) }
          : {}),
        inferenceNote: `${data.characters.toLocaleString()} characters generated`,
      });
    if (data.type === "result" && data.id === activeRequest) {
      const speed = data.metrics?.decode_tokens_per_s;
      update({
        ...(data.usage
          ? {
              prefill: data.usage.input.toLocaleString(),
              speed: Number.isFinite(speed) ? speed.toFixed(1) : "—",
            }
          : {}),
        inferenceNote: data.error
          ? "Generation interrupted or failed"
          : "Inference completed on this device",
        modelStatus: status("Ready", "ready"),
      });
      try {
        await runtime.respond(data);
      } catch (error) {
        message("BRIDGE", error.message, true);
        done();
      }
    }
  };
  worker.onerror = (event) => {
    const error = event.message || "Inference worker failed. Reload the page.";
    const request = activeRequest;
    update({
      modelReady: false,
      loading: false,
      loadDetail: error,
      loadLabel: "Reload page",
    });
    done();
    update({ modelStatus: status("Worker failed", "error") });
    if (request)
      runtime
        .respond({ id: request, error })
        .catch((error) => message("BRIDGE", error.message, true));
  };
  async function checkGPU() {
    try {
      const adapter = await gpu?.requestAdapter();
      update({
        gpuAvailable: !!adapter,
        gpuLabel: adapter
          ? `WebGPU available${adapter.info?.architecture ? " · " + adapter.info.architecture : ""}`
          : "WebGPU unavailable",
        ...(!adapter
          ? {
              loadDetail:
                "Open in a desktop browser with WebGPU and hardware acceleration enabled.",
            }
          : {}),
      });
    } catch (error) {
      update({ gpuLabel: "WebGPU unavailable", loadDetail: error.message });
    }
  }
  checkGPU();
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async boot(mount) {
      if (state.bootStarted) return;
      update({
        bootStarted: true,
        bootLabel: "Booting…",
        agentStatus: status("Booting Linux", "busy"),
      });
      try {
        await runtime.boot(mount);
      } catch (error) {
        update({
          agentStatus: status("Boot failed", "error"),
          bootLabel: "Reload to retry",
        });
        message("WORKSPACE", error.message, true);
        diagnostic(error.stack || error.message);
      }
    },
    load() {
      if (state.busy || state.loading || !state.gpuAvailable) return;
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
    },
    selectModel(model) {
      if (state.busy || state.loading || !models.some((m) => m.id === model))
        return;
      update({
        model,
        modelReady: false,
        modelStatus: status("Unloaded"),
        loadLabel: "Load model",
        loadDetail: modelDetail(model),
      });
    },
    async send(text) {
      text = text.trim();
      if (!text || state.busy || !state.linuxReady || !state.modelReady)
        return false;
      update({ busy: true });
      message("YOU", text);
      try {
        await runtime.command("prompt", text);
      } catch (error) {
        message("WORKSPACE", error.message, true);
        done();
      }
      return true;
    },
    async stop() {
      if (!state.busy) return;
      worker.postMessage({ type: "cancel" });
      try {
        await runtime.command("abort");
      } catch (error) {
        message("WORKSPACE", error.message, true);
        done();
      }
    },
    refresh() {
      update({ previewVersion: state.previewVersion + 1 });
    },
    async reset() {
      if (state.busy || !state.linuxReady) return;
      try {
        await runtime.reset();
      } catch (error) {
        message("WORKSPACE", error.message, true);
      }
    },
    exportApp() {
      if (!state.files) return;
      const url = URL.createObjectURL(
        new Blob([buildPreview(state.files)], { type: "text/html" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "fieldwork-app.html";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
}
