import {
  commandSchema,
  inferenceRequestSchema,
  inferenceResultSchema,
  parseAgentEvent,
  requestIdSchema,
} from "../../shared/contracts.ts";
import type {
  AgentEvent,
  CommandInput,
  InferenceResult,
} from "../../shared/contracts.ts";
import { errorMessage } from "../../shared/errors.ts";
import { PROJECT_FILES } from "../../shared/project-files.ts";
import { starter } from "../../shared/starter.ts";
import type { ProjectFile, ProjectFiles, RuntimeEvents } from "../types.ts";

// The Wanix custom element supplies this filesystem after its ready event.
interface WanixFilesystem {
  makeDirAll(path: string): Promise<unknown>;
  bind(source: string, destination: string): Promise<unknown>;
  readText(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<unknown>;
  rename(from: string, to: string): Promise<unknown>;
  remove(path: string): Promise<unknown>;
  readDir(path: string): Promise<(string | { Name?: string; name?: string })[]>;
}
interface WanixNamespace extends HTMLElement {
  root: WanixFilesystem;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class LinuxRuntime extends EventTarget {
  root!: WanixFilesystem;
  system!: WanixNamespace;
  bootTimer?: ReturnType<typeof setTimeout>;
  running = false;
  seenRequests = new Set<string>();
  lastRequestText = "";

  addEventListener<K extends keyof RuntimeEvents>(
    type: K,
    listener: (event: CustomEvent<RuntimeEvents[K]>) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener:
      | EventListenerOrEventListenerObject
      | ((event: CustomEvent<RuntimeEvents[keyof RuntimeEvents]>) => void)
      | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    super.addEventListener(
      type,
      listener as EventListenerOrEventListenerObject | null,
      options,
    );
  }

  emit<K extends keyof RuntimeEvents>(type: K, detail: RuntimeEvents[K]) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  async boot(mount: HTMLElement) {
    await this.initializeNamespace(mount);
    await this.prepareWorkspace();
    this.emit("snapshot", await this.snapshot());
    this.running = true;
    this.poll();
    this.startGuest();
  }

  private async initializeNamespace(mount: HTMLElement) {
    const response = await fetch("/agent-rootfs.tgz", { method: "HEAD" });
    if (
      !response.ok ||
      response.headers.get("content-type")?.includes("text/html")
    ) {
      throw new Error(
        "Linux image missing. Run npm run assets, then npm run guest.",
      );
    }
    if (!customElements.get("wanix-namespace")) {
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
    }
    this.system = document.createElement("wanix-namespace") as WanixNamespace;
    this.system.id = "agent-linux";
    this.system.setAttribute("wasm", "/runtime/wanix.wasm");
    this.system.innerHTML = `<wanix-bind dst="." type="archive" src="/agent-rootfs.tgz"></wanix-bind><wanix-bind dst="#vm/v86" type="archive" src="/runtime/v86.tgz"></wanix-bind>`;
    const ready = new Promise<void>((resolve, reject) => {
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
          reject(
            event instanceof CustomEvent
              ? event.detail?.error || new Error("Wanix boot failed")
              : new Error("Wanix boot failed"),
          );
        },
        { once: true },
      );
    });
    mount.append(this.system);
    await ready;
    this.root = this.system.root;
  }

  private async prepareWorkspace() {
    await this.root.makeDirAll("bridge");
    await this.root.makeDirAll("project");
    try {
      await this.root.makeDirAll("#web/opfs/browser-agent-project");
      await this.root.bind("#web/opfs/browser-agent-project", "project");
    } catch (error) {
      this.emit(
        "diagnostic",
        `Persistence unavailable: ${errorMessage(error)}`,
      );
    }
    for (const file of PROJECT_FILES) {
      try {
        await this.root.readText(`project/${file}`);
      } catch {
        await this.root.writeFile(`project/${file}`, starter[file]);
      }
    }
  }

  private startGuest() {
    const vm = document.createElement("wanix-vm");
    vm.id = "guest";
    vm.setAttribute("mem", "512M");
    vm.setAttribute("term", "");
    vm.setAttribute("start", "");
    vm.addEventListener("error", (event) =>
      this.emit(
        "fatal",
        event instanceof CustomEvent
          ? errorMessage(event.detail?.error || "VM failed")
          : "VM failed",
      ),
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

  async snapshot(): Promise<ProjectFiles> {
    const entries = await Promise.all(
      PROJECT_FILES.map(async (file) => [
        file,
        await this.root.readText(`project/${file}`),
      ]),
    );
    return Object.fromEntries(entries) as ProjectFiles;
  }

  async command(input: CommandInput) {
    if (!this.root) {
      throw new Error("Linux is not booted");
    }
    const command = commandSchema.parse({ ...input, id: crypto.randomUUID() });
    // Subscribe before writing: the guest may acknowledge immediately.
    const acknowledgement =
      command.type === "new_session"
        ? this.waitForAcknowledgement(command.id)
        : undefined;
    try {
      await Promise.all([
        this.atomic("bridge/command.json", command),
        acknowledgement?.promise,
      ]);
    } finally {
      acknowledgement?.dispose();
    }
  }

  private waitForAcknowledgement(id: string) {
    let cleanup: (() => void) | undefined;
    const promise = new Promise<void>((resolve, reject) => {
      const onEvent = ({ detail }: CustomEvent<AgentEvent>) => {
        if (detail.type !== "response" || detail.id !== id) {
          return;
        }
        cleanup?.();
        if (detail.success) {
          resolve();
        } else {
          reject(new Error(detail.error || "Session reset failed"));
        }
      };
      const timer = setTimeout(() => {
        cleanup?.();
        reject(
          new Error(
            "Pi did not confirm the reset. Reload Linux before continuing.",
          ),
        );
      }, 15000);
      cleanup = () => {
        clearTimeout(timer);
        this.removeEventListener("event", onEvent as EventListener);
      };
      this.addEventListener("event", onEvent);
    });
    return { promise, dispose: () => cleanup?.() };
  }

  async atomic(path: string, value: unknown) {
    await this.root.writeFile(path + ".tmp", JSON.stringify(value));
    await this.root.rename(path + ".tmp", path);
  }

  async respond(response: InferenceResult) {
    const result = inferenceResultSchema.parse(response);
    await this.atomic(`bridge/response-${result.id}.json`, result);
  }

  async saveFile(file: ProjectFile, content: string, expected: string) {
    if (!PROJECT_FILES.includes(file)) {
      throw new Error("Unknown workspace file");
    }
    const path = `project/${file}`;
    if ((await this.root.readText(path)) !== expected) {
      throw new Error(
        "This file changed in the workspace. Reload it before saving.",
      );
    }
    await this.root.writeFile(`${path}.tmp`, content);
    await this.root.rename(`${path}.tmp`, path);
    return this.snapshot();
  }

  async reset() {
    for (const file of PROJECT_FILES) {
      await this.root.writeFile(`project/${file}`, starter[file]);
    }
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
          .filter((name): name is string => typeof name === "string")
          .toSorted();
        for (const name of names.filter((n) => /^event-\d+\.json$/.test(n))) {
          await this.receiveEventFile(name);
        }
        if (names.includes("request.json")) {
          const text = await this.root.readText("bridge/request.json");
          if (text !== this.lastRequestText) {
            await this.receiveRequest(text);
            this.lastRequestText = text;
          }
        }
        failures = 0;
      } catch (error) {
        if (++failures === 5) {
          this.emit("diagnostic", `Bridge read failed: ${errorMessage(error)}`);
        }
      }
      await delay(250);
    }
  }

  private async receiveEventFile(name: string) {
    const text = await this.root.readText(`bridge/${name}`);
    await this.root.remove(`bridge/${name}`);
    let event;
    try {
      event = parseAgentEvent(JSON.parse(text));
    } catch (error) {
      this.emit(
        "diagnostic",
        `Invalid guest event ${name}: ${errorMessage(error)}`,
      );
      return;
    }
    if (!event) {
      return;
    }
    if (event.type === "ready") {
      clearTimeout(this.bootTimer);
    }
    this.emit("event", event);
    if (event.type === "tool_execution_end" || event.type === "agent_end") {
      this.emit("snapshot", await this.snapshot());
    }
  }

  async receiveRequest(text: string) {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (error) {
      this.emit(
        "diagnostic",
        `Invalid inference request JSON: ${errorMessage(error)}`,
      );
      return;
    }
    const parsed = inferenceRequestSchema.safeParse(value);
    if (!parsed.success) {
      const error = `Invalid inference request: ${parsed.error.message}`;
      this.emit("diagnostic", error);
      // Reply only when the ID is safe to use as a bridge filename.
      const id = requestIdSchema.safeParse(
        typeof value === "object" && value !== null && "id" in value
          ? value.id
          : undefined,
      );
      if (id.success && !this.seenRequests.has(id.data)) {
        await this.respond({ id: id.data, error });
        this.seenRequests.add(id.data);
      }
      return;
    }
    const request = parsed.data;
    if (this.seenRequests.has(request.id)) {
      return;
    }
    // Missing files must not prevent the agent from repairing the workspace.
    const workspaceFiles = await this.snapshot().catch(() => undefined);
    this.seenRequests.add(request.id);
    this.emit("inference", {
      ...request,
      context: { ...request.context, workspaceFiles },
    });
  }
}
