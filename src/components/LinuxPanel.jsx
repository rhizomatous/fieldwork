import "./LinuxPanel.css";
import { Button } from "../design-system/Button.jsx";
import { StatusIndicator } from "../design-system/StatusIndicator.jsx";

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
        <StatusIndicator id="linux-state" value={state.linuxStatus} />
      </div>
      <div className="runtime-status">
        <span>Pi</span>
        <StatusIndicator id="agent-state" value={state.agentStatus} />
      </div>
      <Button
        id="boot"
        variant="secondary"
        disabled={state.bootStarted}
        onClick={onBoot}
      >
        {state.bootLabel}
      </Button>
      <div className="runtime-footnote project-actions">
        <Button
          id="console-toggle"
          variant="secondary"
          size="small"
          aria-expanded={consoleOpen}
          aria-controls="console-panel"
          onClick={onToggleConsole}
        >
          {consoleOpen ? "Close console" : "Open console"}
        </Button>
        <Button
          id="reset"
          variant="secondary"
          size="small"
          destructive
          disabled={state.busy || !state.linuxReady}
          onClick={onReset}
          title="Replace index.html, style.css, and script.js with starter files and reset Pi’s session"
        >
          Reset project
        </Button>
      </div>
    </section>
  );
}
