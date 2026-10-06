import { Status } from "./Status.jsx";
import { Conversation } from "./Conversation.jsx";
import { PromptComposer } from "./PromptComposer.jsx";

export function AgentPanel({ state, session }) {
  const ready = state.linuxReady && state.modelReady;
  const failed =
    state.agentStatus.kind === "error" || state.modelStatus.kind === "error";
  const status = failed
    ? { text: "Needs attention", kind: "error" }
    : state.busy
      ? { text: "Working", kind: "busy" }
      : ready
        ? { text: "Ready", kind: "ready" }
        : { text: "Not ready", kind: "" };
  return (
    <section className="agent-panel" aria-labelledby="agent-title">
      <div className="pane-heading">
        <h1 id="agent-title">Agent</h1>
        <Status id="agent-readiness" value={status} />
      </div>
      <Conversation state={state} />
      <PromptComposer state={state} session={session} />
    </section>
  );
}
