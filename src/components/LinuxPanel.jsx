import { Status } from "./Status.jsx";

export function LinuxPanel({
  state,
  onBoot,
  onReset,
  consoleOpen,
  onToggleConsole,
}) {
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
      <div className="runtime-footnote project-actions">
        <button
          id="console-toggle"
          className="console-button"
          aria-expanded={consoleOpen}
          aria-controls="console-panel"
          onClick={onToggleConsole}
        >
          {consoleOpen ? "Close console" : "Open console"}
        </button>
        <button
          id="reset"
          className="console-button destructive-button"
          disabled={state.busy || !state.linuxReady}
          onClick={onReset}
          title="Replace index.html, style.css, and script.js with starter files and reset Pi’s session"
        >
          Reset project
        </button>
      </div>
    </section>
  );
}
