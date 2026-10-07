import { Button } from "../design-system/Button.tsx";

import "./AgentPanel.css";
import { StatusIndicator } from "../design-system/StatusIndicator.tsx";
import type { PanelProps, Status } from "../types.ts";

import { Conversation } from "./Conversation.tsx";
import { PromptComposer } from "./PromptComposer.tsx";

export function AgentPanel({ state, session }: PanelProps) {
  const ready = state.linuxReady && state.modelReady;
  const failed =
    state.agentStatus.kind === "error" || state.modelStatus.kind === "error";
  const status: Status = failed
    ? { text: "Not ready", kind: "" }
    : state.busy
      ? { text: "Working", kind: "busy" }
      : ready
        ? { text: "Ready", kind: "ready" }
        : { text: "Not ready", kind: "" };
  return (
    <section className="agent-panel" aria-labelledby="agent-title">
      <div className="pane-heading">
        <h1 id="agent-title">Agent</h1>
        <div className="agent-tools">
          <Button
            variant="ghost"
            disabled={!state.canResetChat || state.messages.length === 0}
            onClick={() => session.resetChat()}
            title="Clear conversation and start a fresh agent session; keep app files"
          >
            {state.resettingChat ? "Resetting…" : "Reset chat"}
          </Button>
          <StatusIndicator id="agent-readiness" value={status} />
        </div>
      </div>
      <Conversation state={state} />
      <PromptComposer state={state} session={session} />
    </section>
  );
}
