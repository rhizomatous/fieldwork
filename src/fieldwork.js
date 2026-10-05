import { LinuxRuntime } from "./runtime.js";
import { createSession } from "./session.js";

export const session = createSession({
  runtime: new LinuxRuntime(),
  worker: new Worker(new URL("./inference.worker.js", import.meta.url), {
    type: "module",
  }),
});
