import { LinuxRuntime } from "./runtime.ts";
import { createSession } from "./session.ts";

export const session = createSession({
  runtime: new LinuxRuntime(),
  worker: new Worker(new URL("./inference.worker.ts", import.meta.url), {
    type: "module",
  }),
});
