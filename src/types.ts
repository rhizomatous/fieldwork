import type { PROJECT_FILES } from "./project-files.js";
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
export interface SessionState {
  savingFile: ProjectFile | null;
  linuxReady: boolean;
  linuxStatus: Status;
  bootStarted: boolean;
  bootLabel: string;
  modelReady: boolean;
  loading: boolean;
  busy: boolean;
  resettingChat: boolean;
  gpuAvailable: boolean;
  agentStatus: Status;
  modelStatus: Status;
  model: string;
  loadLabel: string;
  loadDetail: string;
  progress: number;
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
export type Session = ReturnType<typeof createSession>;
export type PanelProps = { state: SessionState; session: Session };

// Shapes exchanged with the JavaScript guest and inference worker.
export type AgentEvent =
  | { type: "boot" | "diagnostic" | "fatal"; message: string }
  | { type: "ready" | "agent_start" | "message_start" | "agent_end" }
  | {
      type: "tool_execution_start";
      toolName: string;
      args?: { path?: string; command?: string };
    }
  | {
      type: "tool_execution_end";
      isError?: boolean;
      result?: { content?: { type: string; text?: string }[] };
    }
  | {
      type: "message_update";
      assistantMessageEvent?: { type: string; delta?: string };
    }
  | { type: "message_end"; message?: { errorMessage?: string } }
  | { type: "response"; id?: string; success?: boolean; error?: string };
export type InferenceRequest = { id: string; context: unknown };
export type InferenceResult = {
  type?: "result";
  id: string;
  error?: string;
  action?: unknown;
  usage?: { input: number; output: number; totalTokens: number };
  metrics?: { decode_tokens_per_s?: number };
};
export type WorkerMessage =
  | { type: "progress"; progress?: number; text: string }
  | { type: "loaded" }
  | { type: "load-error"; error: string }
  | { type: "tokens"; id: string; firstToken?: number; characters: number }
  | (InferenceResult & { type: "result" });
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
  command(type: string, message?: string): Promise<void>;
  saveFile(
    file: ProjectFile,
    content: string,
    expected: string,
  ): Promise<ProjectFiles>;
  reset(): Promise<void>;
  respond(response: InferenceResult): Promise<void>;
}
