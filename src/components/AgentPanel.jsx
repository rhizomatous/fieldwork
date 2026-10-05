import { Status } from "./Status.jsx";
import { Conversation } from "./Conversation.jsx";
import { PromptComposer } from "./PromptComposer.jsx";

export function AgentPanel({
  state,
  session,
  onBoot,
  consoleOpen,
  onToggleConsole,
}) {
  return (
    <section className="agent-panel" aria-labelledby="agent-title">
      <div className="pane-heading">
        <h1 id="agent-title">
          Agent <span className="label">PI / LINUX</span>
        </h1>
        <Status id="agent-state" value={state.agentStatus} />
      </div>
      <Conversation state={state} onBoot={onBoot} />
      <PromptComposer
        state={state}
        session={session}
        consoleOpen={consoleOpen}
        onToggleConsole={onToggleConsole}
      />
    </section>
  );
}
