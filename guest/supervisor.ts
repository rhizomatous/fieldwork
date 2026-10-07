import fs from "node:fs";

import type { AgentEvent as PiAgentEvent } from "@mariozechner/pi-agent-core";

import { commandSchema, requestIdSchema } from "../shared/contracts.ts";
import type { AgentEvent } from "../shared/contracts.ts";
import { errorMessage, isMissingFile } from "../shared/errors.ts";

import type { BrowserProviderConfig } from "./provider.ts";

const dir = process.env.BRIDGE_DIR || "/bridge";
const cwd = process.env.PROJECT_DIR || "/project";

fs.mkdirSync(dir, { recursive: true });

let sequence = 0;

function emit(event: AgentEvent | PiAgentEvent) {
  const name = `${dir}/event-${String(++sequence).padStart(8, "0")}.json`;
  fs.writeFileSync(`${name}.tmp`, JSON.stringify(event));
  fs.renameSync(`${name}.tmp`, name);
}

emit({
  type: "boot",
  message: `Linux ${process.arch} · Node ${process.version} · loading Pi core`,
});

try {
  const [
    { Agent },
    { default: browserProvider },
    { createReadTool, createWriteTool, createEditTool, createBashTool },
  ] = await Promise.all([
    import("@mariozechner/pi-agent-core"),
    import("./provider.ts"),
    import("@mariozechner/pi-coding-agent"),
  ]);

  let provider: BrowserProviderConfig | undefined;
  const hooks = new Map<string, () => void>();

  browserProvider({
    on: (name, fn) => hooks.set(name, fn),
    registerProvider: (_, config) => {
      provider = config;
    },
  });

  if (!provider) {
    throw new Error("Browser provider was not registered");
  }

  const model = {
    ...provider.models[0],
    api: provider.api,
    provider: "browser",
    baseUrl: provider.baseUrl,
  };
  const agent = new Agent({
    initialState: {
      systemPrompt:
        "You edit a small vanilla website in /project. The only app files are index.html, style.css, script.js. Read relevant files before editing. Keep files short. Do not install dependencies or use the network. Use relative references style.css and script.js in HTML. Complete the requested change, then briefly explain what changed.",
      model,
      thinkingLevel: "off",
      tools: [
        createReadTool(cwd, { autoResizeImages: false }),
        createWriteTool(cwd),
        createEditTool(cwd),
        createBashTool(cwd),
      ],
    },
    streamFn: provider.streamSimple,
    getApiKey: () => "local-only",
  });

  agent.subscribe((event) => {
    hooks.get(event.type)?.();
    emit(event);
  });

  emit({
    type: "ready",
  });

  let lastCommand = "";
  let lastCommandText = "";

  setInterval(() => {
    let commandId: string | undefined;
    try {
      const text = fs.readFileSync(`${dir}/command.json`, "utf8");
      if (text === lastCommandText) {
        return;
      }
      lastCommandText = text;
      const value: unknown = JSON.parse(text);
      const id = requestIdSchema.safeParse(
        typeof value === "object" && value !== null && "id" in value
          ? value.id
          : undefined,
      );
      commandId = id.success ? id.data : undefined;
      const command = commandSchema.parse(value);

      if (!command.id || command.id === lastCommand) {
        return;
      }

      lastCommand = command.id;

      if (command.type === "abort") {
        agent.abort();
      } else if (command.type === "new_session") {
        if (agent.state.isStreaming) {
          throw new Error("Stop the agent before resetting");
        }

        agent.reset();

        emit({
          type: "response",
          id: command.id,
          success: true,
        });
      } else if (command.type === "prompt") {
        if (agent.state.isStreaming) {
          throw new Error("The agent is already working");
        }

        agent.prompt(command.message).catch((error) =>
          emit({
            type: "response",
            id: command.id,
            success: false,
            error: errorMessage(error),
          }),
        );
      } else {
        throw new Error("Unsupported bridge command");
      }
    } catch (error) {
      if (!isMissingFile(error)) {
        emit({
          type: "response",
          id: commandId,
          success: false,
          error: errorMessage(error),
        });
      }
    }
  }, 150);
} catch (error) {
  emit({
    type: "fatal",
    message:
      error instanceof Error ? error.stack || error.message : String(error),
  });

  process.exitCode = 1;
}
