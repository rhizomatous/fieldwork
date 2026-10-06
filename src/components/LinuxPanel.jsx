import { Status } from "./Status.jsx";

export function LinuxPanel({ state, onBoot, consoleOpen, onToggleConsole }) {
  return (
    <section className="linux-panel" aria-labelledby="linux-title">
      <h2 id="linux-title">Linux</h2>
      <div className="runtime-status">
        <span>Linux</span>
        <Status id="linux-state" value={state.linuxStatus} />
      </div>
      <div className="runtime-status">
        <span>Pi</span>
        <Status id="agent-state" value={state.agentStatus} />
      </div>
      <button
        id="boot"
        className="button"
        disabled={state.bootStarted}
        onClick={onBoot}
      >
        {state.bootLabel}
      </button>
      <div className="runtime-footnote">
        <span id="storage">{state.storage}</span>
        <button
          id="console-toggle"
          className="text-button"
          aria-expanded={consoleOpen}
          aria-controls="console-panel"
          onClick={onToggleConsole}
        >
          Boot console
        </button>
      </div>
    </section>
  );
}
