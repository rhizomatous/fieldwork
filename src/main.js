import "./style.css";
import { LinuxRuntime } from "./runtime.js";
import { starter } from "./starter.js";
import { buildPreview } from "./protocol.js";

const $ = (id) => document.getElementById(id);
const runtime = new LinuxRuntime();
const worker = new Worker(new URL("./inference.worker.js", import.meta.url), {
  type: "module",
});
let linuxReady = false,
  modelReady = false,
  busy = false,
  activeRequest = null,
  gpuAvailable = false;
let turnChanged = false;
let files = { ...starter },
  revision = 0,
  previewChannel = "",
  currentAssistant;
const estimates = {
  "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC": "1.6",
  "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC": "2.5",
  "Qwen3-4B-q4f16_1-MLC": "3.4",
};

function state(id, text, kind = "") {
  $(id).textContent = text;
  $(id).className = `status ${kind}`;
}
function controls() {
  $("send").disabled = !linuxReady || !modelReady || busy;
  $("stop").hidden = !busy;
  $("reset").disabled = busy;
  const loading = $("model-state").textContent === "Loading";
  $("model").disabled = busy || loading;
  $("load").disabled = busy || loading || !gpuAvailable;
  $("composer-hint").textContent = busy
    ? "Pi is working inside Linux…"
    : linuxReady && modelReady
      ? "Enter to send · Shift + Enter for a new line"
      : "Start Linux and load a model to begin";
}
function scroll() {
  $("conversation").scrollTop = $("conversation").scrollHeight;
}
function message(who, text, error = false) {
  const node = document.createElement("article");
  node.className = `message${error ? " error" : ""}`;
  const label = document.createElement("span");
  label.className = "speaker";
  label.textContent = who;
  const body = document.createElement("p");
  body.textContent = text;
  node.append(label, body);
  $("conversation").append(node);
  scroll();
  return body;
}
function diagnostic(text) {
  $("diagnostics").textContent = (
    $("diagnostics").textContent +
    text +
    "\n"
  ).slice(-24000);
}
function renderPreview() {
  previewChannel = crypto.randomUUID();
  $("preview-error").hidden = true;
  $("preview").srcdoc = buildPreview(files, previewChannel);
}
function tool(event) {
  const node = document.createElement("div");
  node.className = "tool-event";
  const title = document.createElement("strong");
  title.textContent = `${event.toolName} `;
  const path = event.args?.path || event.args?.command || "";
  node.append(title, document.createTextNode(path.slice(0, 160)));
  $("conversation").append(node);
  scroll();
}
function done() {
  busy = false;
  activeRequest = null;
  controls();
  state(
    "agent-state",
    linuxReady ? "Ready" : "Not started",
    linuxReady ? "ready" : "",
  );
  state(
    "model-state",
    modelReady ? "Ready" : "Unloaded",
    modelReady ? "ready" : "",
  );
}

runtime.addEventListener("event", ({ detail: event }) => {
  if (event.type === "boot") {
    diagnostic(event.message);
    state("agent-state", "Starting Pi", "busy");
  }
  if (event.type === "ready") {
    linuxReady = true;
    state("agent-state", "Ready", "ready");
    $("boot").textContent = "Linux running";
    $("boot").disabled = true;
    $("preview-status").textContent = "Shared with Linux";
    controls();
    message(
      "WORKSPACE",
      "Pi is ready. The preview now reads the files inside Linux.",
    );
  }
  if (event.type === "diagnostic") diagnostic(event.message);
  if (event.type === "fatal") {
    linuxReady = false;
    done();
    state("agent-state", "Failed", "error");
    message(
      "WORKSPACE",
      event.message + ". Open the boot console for details.",
      true,
    );
  }
  if (event.type === "agent_start") {
    busy = true;
    turnChanged = false;
    currentAssistant = null;
    controls();
    state("agent-state", "Working", "busy");
  }
  if (event.type === "tool_execution_start") tool(event);
  if (event.type === "tool_execution_end" && event.isError)
    message(
      "TOOL ERROR",
      (event.result?.content || [])
        .filter((x) => x.type === "text")
        .map((x) => x.text)
        .join("\n")
        .slice(0, 1600),
      true,
    );
  if (event.type === "message_start") currentAssistant = null;
  if (
    event.type === "message_update" &&
    event.assistantMessageEvent?.type === "text_delta"
  ) {
    currentAssistant ??= message("PI", "");
    currentAssistant.textContent += event.assistantMessageEvent.delta;
    scroll();
  }
  if (event.type === "message_end" && event.message?.errorMessage)
    message("PI", event.message.errorMessage, true);
  if (event.type === "agent_end") {
    if (!turnChanged)
      message("WORKSPACE", "No app files changed in this turn.");
    done();
  }
  if (event.type === "response" && event.success === false) {
    message("PI", event.error || "Command failed", true);
    done();
  }
});
runtime.addEventListener("diagnostic", ({ detail }) => diagnostic(detail));
runtime.addEventListener("fatal", ({ detail }) => {
  linuxReady = false;
  done();
  state("agent-state", "Failed", "error");
  message("WORKSPACE", detail, true);
});
runtime.addEventListener("storage", ({ detail }) => {
  $("storage").textContent = detail;
});
runtime.addEventListener("snapshot", ({ detail }) => {
  if (JSON.stringify(detail) !== JSON.stringify(files)) {
    if (busy) turnChanged = true;
    files = detail;
    revision++;
    renderPreview();
    $("revision").textContent = `Revision ${revision} · saved in workspace`;
  }
});
runtime.addEventListener("inference", async ({ detail }) => {
  if (!modelReady) {
    await runtime.respond({
      id: detail.id,
      error: "Load a local model before asking Pi to work.",
    });
    return;
  }
  activeRequest = detail.id;
  state("model-state", "Generating", "busy");
  worker.postMessage({ type: "generate", ...detail });
});
worker.onmessage = async ({ data }) => {
  if (data.type === "progress") {
    $("load-progress").value = data.progress || 0;
    $("load-detail").textContent = data.text;
  }
  if (data.type === "loaded") {
    modelReady = true;
    $("load-progress").hidden = true;
    $("load").disabled = false;
    $("load").textContent = "Reload model";
    state("model-state", "Ready", "ready");
    $("setup-model").textContent = "Ready";
    $("load-detail").textContent =
      "Model loaded locally · 4-bit weights · 4,096-token context";
    controls();
  }
  if (data.type === "load-error") {
    modelReady = false;
    state("model-state", "Load failed", "error");
    $("load").disabled = false;
    $("load").textContent = "Retry model";
    $("load-progress").hidden = true;
    $("load-detail").textContent = data.error;
    controls();
  }
  if (data.type === "tokens" && data.id === activeRequest) {
    if (data.firstToken !== undefined)
      $("ttft").innerHTML =
        `${(data.firstToken / 1000).toFixed(1)}<small>seconds</small>`;
    $("inference-note").textContent =
      `${data.characters.toLocaleString()} characters generated`;
  }
  if (data.type === "result") {
    if (data.usage) {
      $("context").innerHTML =
        `${data.usage.input.toLocaleString()}<small>tokens this call</small>`;
      const speed = data.metrics?.decode_tokens_per_s;
      $("speed").innerHTML =
        `${Number.isFinite(speed) ? speed.toFixed(1) : "—"}<small>tokens / sec</small>`;
    }
    $("inference-note").textContent = data.error
      ? "Generation interrupted or failed"
      : "Inference completed on this device";
    state("model-state", "Ready", "ready");
    try {
      await runtime.respond(data);
    } catch (error) {
      message("BRIDGE", error.message, true);
      done();
    }
  }
};
worker.onerror = (event) => {
  modelReady = false;
  state("model-state", "Worker failed", "error");
  $("load-detail").textContent =
    event.message || "Inference worker failed. Reload the page.";
  controls();
};

$("boot").onclick = async () => {
  $("boot").disabled = true;
  $("boot").textContent = "Booting…";
  state("agent-state", "Booting Linux", "busy");
  try {
    await runtime.boot($("runtime-mount"));
  } catch (error) {
    state("agent-state", "Boot failed", "error");
    message("WORKSPACE", error.message, true);
    diagnostic(error.stack || error.message);
    $("boot").textContent = "Reload to retry";
  }
};
$("load").onclick = () => {
  modelReady = false;
  $("load").disabled = true;
  state("model-state", "Loading", "busy");
  $("load").textContent = "Loading…";
  $("load-progress").hidden = false;
  $("load-progress").value = 0;
  $("load-detail").textContent =
    "Preparing model download. The first load can take a few minutes.";
  worker.postMessage({ type: "load", model: $("model").value });
  controls();
};
$("model").onchange = () => {
  modelReady = false;
  state("model-state", "Unloaded");
  $("load-detail").textContent =
    `4-bit weights · ~${estimates[$("model").value]} GB estimated GPU memory · download on first use`;
  controls();
};
$("prompt-form").onsubmit = async (event) => {
  event.preventDefault();
  const text = $("prompt").value.trim();
  if (!text || busy || !linuxReady || !modelReady) return;
  busy = true;
  controls();
  message("YOU", text);
  $("prompt").value = "";
  try {
    await runtime.command("prompt", text);
  } catch (error) {
    message("WORKSPACE", error.message, true);
    done();
  }
};
$("prompt").onkeydown = (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    $("prompt-form").requestSubmit();
  }
};
document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.onclick = () => {
    $("prompt").value = button.dataset.prompt;
    $("prompt").focus();
  };
});
$("stop").onclick = async () => {
  worker.postMessage({ type: "cancel" });
  try {
    await runtime.command("abort");
  } catch (error) {
    message("WORKSPACE", error.message, true);
    done();
  }
};
$("refresh").onclick = renderPreview;
$("viewport").onclick = () => {
  const narrow = document
    .querySelector(".preview-stage")
    .classList.toggle("narrow");
  $("viewport").setAttribute(
    "aria-label",
    `Switch to ${narrow ? "wide" : "narrow"} preview`,
  );
};
$("reset").onclick = async () => {
  if (busy) return;
  try {
    if (linuxReady) await runtime.reset();
    else {
      files = { ...starter };
      renderPreview();
    }
  } catch (error) {
    message("WORKSPACE", error.message, true);
  }
};
$("export").onclick = () => {
  const blob = new Blob([buildPreview(files)], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fieldwork-app.html";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
function showConsole(show) {
  $("console-panel").hidden = !show;
  $("console-toggle").setAttribute("aria-expanded", String(show));
}
$("console-toggle").onclick = () => showConsole($("console-panel").hidden);
$("console-close").onclick = () => showConsole(false);
window.addEventListener("message", (event) => {
  if (
    event.source === $("preview").contentWindow &&
    event.data?.channel === previewChannel &&
    event.data.type === "preview-error"
  ) {
    $("preview-error").textContent =
      `Preview: ${String(event.data.message).slice(0, 500)}`;
    $("preview-error").hidden = false;
  }
});
renderPreview();
try {
  const adapter = await navigator.gpu?.requestAdapter();
  gpuAvailable = !!adapter;
  $("gpu").textContent = adapter
    ? `WebGPU available${adapter.info?.architecture ? " · " + adapter.info.architecture : ""}`
    : "WebGPU unavailable";
  if (!adapter) {
    $("load").disabled = true;
    $("load-detail").textContent =
      "Open in a desktop browser with WebGPU and hardware acceleration enabled.";
  }
} catch (error) {
  $("gpu").textContent = "WebGPU unavailable";
  $("load-detail").textContent = error.message;
  $("load").disabled = true;
}
