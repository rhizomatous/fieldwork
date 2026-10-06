import "./AgentPanel.css";
import { Button } from "../design-system/Button.jsx";
import { StatusIndicator } from "../design-system/StatusIndicator.jsx";
import { Conversation } from "./Conversation.jsx";
import { PromptComposer } from "./PromptComposer.jsx";

export function AgentPanel({ state, session }) {
  const ready = state.linuxReady && state.modelReady;
  const failed =
    state.agentStatus.kind === "error" || state.modelStatus.kind === "error";
  const status = failed
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
            disabled={state.busy || state.messages.length === 0}
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
