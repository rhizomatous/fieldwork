import { Button } from "../design-system/Button.tsx";

import "./LinuxPanel.css";
import { StatusIndicator } from "../design-system/StatusIndicator.tsx";
import type { SessionState } from "../types.ts";

export function LinuxPanel({
  state,
  onBoot,
  onReset,
  consoleOpen,
  onToggleConsole,
}: {
  state: SessionState;
  onBoot: () => void;
  onReset: () => void;
  consoleOpen: boolean;
  onToggleConsole: () => void;
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
          disabled={!state.canResetProject}
          onClick={onReset}
          title="Replace index.html, style.css, and script.js with starter files"
        >
          Reset project
        </Button>
      </div>
    </section>
  );
}
