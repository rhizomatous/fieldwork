import type {
  AgentEvent,
  CommandInput,
  InferenceRequest,
  InferenceResult,
  WorkerRequest,
} from "../shared/contracts.ts";

import type { PROJECT_FILES } from "./project-files.ts";
import type { createSession } from "./session.ts";

export type Status = { text: string; kind: "" | "ready" | "busy" | "error" };
export type ProjectFile = (typeof PROJECT_FILES)[number];
export type ProjectFiles = Record<ProjectFile, string>;

export type ChatMessage = {
  id: number;
  text: string;
  who?: string;
  tool?: string;
  error?: boolean;
};
export type LinuxPhase =
  | "off"
  | "booting"
  | "starting"
  | "ready"
  | "boot-error"
  | "failed";
export type ModelPhase =
  | "unloaded"
  | "loading"
  | "ready"
  | "generating"
  | "load-error"
  | "worker-error"
  | "unsupported";
export type SessionOperation =
  | { type: "idle" }
  | { type: "working" }
  | {
      type: "prompting" | "resetting-chat" | "resetting-project";
    }
  | { type: "saving"; file: ProjectFile };

// Stored facts. Display state is derived and cannot be patched by handlers.
export interface SessionData {
  linuxPhase: LinuxPhase;
  modelPhase: ModelPhase;
  operation: SessionOperation;
  gpuAvailable: boolean;
  modelError: string | null;
  progress: number;
  progressMessage: string;
  gpuLabel: string;
  storage: string;
  messages: ChatMessage[];
  diagnostics: string;
  files: ProjectFiles | null;
  revision: number;
  previewVersion: number;
  ttft: string;
  speed: string;
  prefill: string;
  inferenceNote: string;
}
export interface SessionState extends SessionData {
  readonly savingFile: ProjectFile | null;
  readonly linuxReady: boolean;
  readonly linuxStatus: Status;
  readonly bootStarted: boolean;
  readonly bootLabel: string;
  readonly modelReady: boolean;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly resettingChat: boolean;
  readonly agentStatus: Status;
  readonly modelStatus: Status;
  readonly loadLabel: string;
  readonly loadDetail: string;
  readonly canSend: boolean;
  readonly canLoadModel: boolean;
  readonly canResetChat: boolean;
  readonly canResetProject: boolean;
  readonly canStop: boolean;
}
export type Session = ReturnType<typeof createSession>;
export type PanelProps = { state: SessionState; session: Session };

export type {
  AgentEvent,
  InferenceRequest,
  InferenceResult,
  WorkerMessage,
} from "../shared/contracts.ts";

export interface InferenceWorker {
  postMessage(message: WorkerRequest): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export interface RuntimeEvents {
  event: AgentEvent;
  diagnostic: string;
  fatal: string;
  storage: string;
  snapshot: ProjectFiles;
  inference: InferenceRequest;
}
export interface Runtime {
  addEventListener<K extends keyof RuntimeEvents>(
    type: K,
    listener: (event: CustomEvent<RuntimeEvents[K]>) => void,
  ): void;
  boot(mount: HTMLElement): Promise<void>;
  command(command: CommandInput): Promise<void>;
  saveFile(
    file: ProjectFile,
    content: string,
    expected: string,
  ): Promise<ProjectFiles>;
  reset(): Promise<void>;
  respond(response: InferenceResult): Promise<void>;
}
