import { PROJECT_FILES } from "./protocol.js";
import { starter } from "./starter.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export class LinuxRuntime extends EventTarget {
  root;
  running = false;
  seenRequests = new Set();
  busy = false;
  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  async boot(mount) {
    const response = await fetch("/agent-rootfs.tgz", { method: "HEAD" });
    if (
      !response.ok ||
      response.headers.get("content-type")?.includes("text/html")
    )
      throw new Error(
        "Linux image missing. Run npm run assets, then npm run guest.",
      );
    if (!customElements.get("wanix-namespace"))
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.type = "module";
        script.src = "/runtime/wanix.min.js";
        script.onload = resolve;
        script.onerror = () =>
          reject(
            new Error(
              "Could not load Wanix runtime assets. Run npm run assets.",
            ),
          );
        document.head.append(script);
      });
    this.system = document.createElement("wanix-namespace");
    this.system.id = "agent-linux";
    this.system.setAttribute("wasm", "/runtime/wanix.wasm");
    this.system.innerHTML = `<wanix-bind dst="." type="archive" src="/agent-rootfs.tgz"></wanix-bind><wanix-bind dst="#vm/v86" type="archive" src="/runtime/v86.tgz"></wanix-bind>`;
    const ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          reject(new Error("Wanix initialization timed out. Reload to retry.")),
        120_000,
      );
      this.system.addEventListener(
        "ready",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
      this.system.addEventListener(
        "error",
        (event) => {
          clearTimeout(timeout);
          reject(event.detail?.error || new Error("Wanix boot failed"));
        },
        { once: true },
      );
    });
    mount.append(this.system);
    await ready;
    this.root = this.system.root;
    await this.root.makeDirAll("bridge");
    await this.root.makeDirAll("project");
    try {
      await this.root.makeDirAll("#web/opfs/browser-agent-project");
      await this.root.bind("#web/opfs/browser-agent-project", "project");
      this.emit("storage", "OPFS · saved on this device");
    } catch (error) {
      this.emit("storage", "Memory only · export before closing");
      this.emit("diagnostic", `Persistence unavailable: ${error.message}`);
    }
    for (const file of PROJECT_FILES) {
      try {
        await this.root.readText(`project/${file}`);
      } catch {
        await this.root.writeFile(`project/${file}`, starter[file]);
      }
    }
    this.emit("snapshot", await this.snapshot());
    this.running = true;
    this.poll();
    const vm = document.createElement("wanix-vm");
    vm.id = "guest";
    vm.setAttribute("mem", "512M");
    vm.setAttribute("term", "");
    vm.setAttribute("start", "");
    vm.addEventListener("error", (event) =>
      this.emit("fatal", event.detail?.error?.message || "VM failed"),
    );
    this.system.append(vm);
    const terminal = document.createElement("wanix-term");
    terminal.setAttribute("path", "#vm/guest/term");
    terminal.setAttribute("raw", "");
    terminal.style.height = "260px";
    this.system.append(terminal);
    this.bootTimer = setTimeout(
      () =>
        this.emit(
          "diagnostic",
          "Linux is taking longer than expected. Open the boot console to inspect startup.",
        ),
      90_000,
    );
  }
  async snapshot() {
    const entries = await Promise.all(
      PROJECT_FILES.map(async (file) => [
        file,
        await this.root.readText(`project/${file}`),
      ]),
    );
    return Object.fromEntries(entries);
  }
  async command(type, message) {
    if (!this.root) throw new Error("Linux is not booted");
    await this.atomic("bridge/command.json", {
      id: crypto.randomUUID(),
      type,
      ...(message ? { message } : {}),
    });
  }
  async atomic(path, value) {
    await this.root.writeFile(path + ".tmp", JSON.stringify(value));
    await this.root.rename(path + ".tmp", path);
  }
  async respond(response) {
    await this.atomic(`bridge/response-${response.id}.json`, response);
  }
  async reset() {
    for (const file of PROJECT_FILES)
      await this.root.writeFile(`project/${file}`, starter[file]);
    await this.command("new_session");
    this.emit("snapshot", await this.snapshot());
  }
  async poll() {
    let failures = 0;
    while (this.running) {
      try {
        const entries = (await this.root.readDir("bridge")) || [];
        const names = entries
          .map((entry) =>
            typeof entry === "string" ? entry : (entry.Name ?? entry.name),
          )
          .filter(Boolean)
          .sort();
        for (const name of names.filter((n) => /^event-\d+\.json$/.test(n))) {
          const event = JSON.parse(await this.root.readText(`bridge/${name}`));
          await this.root.remove(`bridge/${name}`);
          if (event.type === "ready") clearTimeout(this.bootTimer);
          this.emit("event", event);
          if (event.type === "tool_execution_end" || event.type === "agent_end")
            this.emit("snapshot", await this.snapshot());
        }
        if (names.includes("request.json")) {
          const request = JSON.parse(
            await this.root.readText("bridge/request.json"),
          );
          if (!this.seenRequests.has(request.id)) {
            this.seenRequests.add(request.id);
            this.emit("inference", request);
          }
        }
        failures = 0;
      } catch (error) {
        if (++failures === 5)
          this.emit("diagnostic", `Bridge read failed: ${error.message}`);
      }
      await delay(250);
    }
  }
}
