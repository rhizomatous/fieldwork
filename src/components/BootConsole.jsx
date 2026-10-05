export function BootConsole({ open, onClose, mountRef, diagnostics }) {
  // Keep mounted while hidden: Wanix owns the descendants of this empty div.
  return (
    <section id="console-panel" aria-label="Linux boot console" hidden={!open}>
      <div className="pane-heading">
        <h2>Linux console</h2>
        <button id="console-close" className="text-button" onClick={onClose}>
          Close
        </button>
      </div>
      <div id="runtime-mount" ref={mountRef} />
      <pre id="diagnostics">{diagnostics}</pre>
    </section>
  );
}
