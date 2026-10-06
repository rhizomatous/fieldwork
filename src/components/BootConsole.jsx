import { EmptyState } from "../design-system/EmptyState.jsx";
import { Button } from "../design-system/Button.jsx";
export function BootConsole({
  open,
  onClose,
  mountRef,
  diagnostics,
  bootStarted,
  linuxStatus,
}) {
  // Keep mounted while hidden: Wanix owns the descendants of this empty div.
  return (
    <section id="console-panel" aria-label="Linux boot console" hidden={!open}>
      <div className="pane-heading">
        <h2>Linux console</h2>
        <Button id="console-close" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      {(!bootStarted || linuxStatus.text === "Booting") && (
        <EmptyState
          headingLevel={3}
          title={bootStarted ? "Linux is starting" : "Linux hasn't started yet"}
          role="status"
        >
          {bootStarted
            ? "The terminal will appear here as Linux boots."
            : "Start Linux to see its terminal and startup logs here."}
        </EmptyState>
      )}
      <div id="runtime-mount" ref={mountRef} />
      <pre id="diagnostics" hidden={!diagnostics}>
        {diagnostics}
      </pre>
    </section>
  );
}
