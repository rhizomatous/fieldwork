import { createSession } from "./session.ts";
import { LinuxRuntime } from "./workspace/linux-runtime.ts";

export const session = createSession({
  runtime: new LinuxRuntime(),
  worker: new Worker(
    new URL("./inference/inference.worker.ts", import.meta.url),
    {
      type: "module",
    },
  ),
});
