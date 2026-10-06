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
        <button id="console-close" className="text-button" onClick={onClose}>
          Close
        </button>
      </div>
      {(!bootStarted || linuxStatus.text === "Booting") && (
        <div className="console-empty-state" role="status">
          <h3>
            {bootStarted ? "Linux is starting" : "Linux hasn't started yet"}
          </h3>
          <p>
            {bootStarted
              ? "The terminal will appear here as Linux boots."
              : "Start Linux to see its terminal and startup logs here."}
          </p>
        </div>
      )}
      <div id="runtime-mount" ref={mountRef} />
      <pre id="diagnostics" hidden={!diagnostics}>
        {diagnostics}
      </pre>
    </section>
  );
}
