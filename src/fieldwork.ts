import { LinuxRuntime } from "./runtime.js";
import { createSession } from "./session.ts";

export const session = createSession({
  runtime: new LinuxRuntime(),
  worker: new Worker(new URL("./inference.worker.js", import.meta.url), {
    type: "module",
  }),
});
