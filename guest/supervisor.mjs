import fs from "node:fs";

const dir = process.env.BRIDGE_DIR || "/bridge";
const cwd = process.env.PROJECT_DIR || "/project";
fs.mkdirSync(dir, { recursive: true });
let sequence = 0;

function emit(event) {
  const name = `${dir}/event-${String(++sequence).padStart(8, "0")}.json`;
  fs.writeFileSync(`${name}.tmp`, JSON.stringify(event));
  fs.renameSync(`${name}.tmp`, name);
}

emit({
  type: "boot",
  message: `Linux ${process.arch} · Node ${process.version} · loading Pi core`,
});
try {
  const [{ Agent }, { default: browserProvider }, read, write, edit, bash] =
    await Promise.all([
      import("@mariozechner/pi-agent-core"),
      import("./provider.mjs"),
      import("./node_modules/@mariozechner/pi-coding-agent/dist/core/tools/read.js"),
      import("./node_modules/@mariozechner/pi-coding-agent/dist/core/tools/write.js"),
      import("./node_modules/@mariozechner/pi-coding-agent/dist/core/tools/edit.js"),
      import("./node_modules/@mariozechner/pi-coding-agent/dist/core/tools/bash.js"),
    ]);
  let provider;
  const hooks = new Map();
  browserProvider({
    on: (name, fn) => hooks.set(name, fn),
    registerProvider: (_, config) => {
      provider = config;
    },
  });
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
        read.createReadTool(cwd, { autoResizeImages: false }),
        write.createWriteTool(cwd),
        edit.createEditTool(cwd),
        bash.createBashTool(cwd),
      ],
    },
    streamFn: provider.streamSimple,
    getApiKey: () => "local-only",
  });
  agent.subscribe((event) => {
    hooks.get(event.type)?.(event);
    emit(event);
  });
  emit({
    type: "ready",
    message: "Pi agent core and coding tools are running inside Linux",
  });
  let lastCommand = "";
  setInterval(() => {
    try {
      const command = JSON.parse(
        fs.readFileSync(`${dir}/command.json`, "utf8"),
      );
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
          command: "new_session",
          success: true,
        });
      } else if (command.type === "prompt") {
        if (agent.state.isStreaming) {
          throw new Error("The agent is already working");
        }
        agent
          .prompt(command.message)
          .catch((error) =>
            emit({ type: "response", success: false, error: error.message }),
          );
      } else {
        throw new Error("Unsupported bridge command");
      }
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) {
        emit({ type: "response", success: false, error: error.message });
      }
    }
  }, 150);
} catch (error) {
  emit({ type: "fatal", message: error.stack || error.message });
  process.exitCode = 1;
}
