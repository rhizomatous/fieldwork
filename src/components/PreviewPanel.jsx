import { useEffect, useMemo, useRef, useState } from "react";
import { buildPreview } from "../protocol.js";

export function PreviewPanel({ state, session }) {
  const [narrow, setNarrow] = useState(false);
  const [error, setError] = useState(null);
  const frame = useRef(null);
  // Metrics and conversation updates must not reload the user's running app.
  const preview = useMemo(() => {
    const channel = crypto.randomUUID();
    try {
      return { channel, html: buildPreview(state.files, channel) };
    } catch (error) {
      return { channel, html: "", error: error.message };
    }
  }, [state.files, state.previewVersion]);
  useEffect(() => {
    function onMessage(event) {
      if (
        event.source === frame.current?.contentWindow &&
        event.data?.channel === preview.channel &&
        event.data.type === "preview-error"
      ) {
        setError({
          channel: preview.channel,
          text: String(event.data.message).slice(0, 500),
        });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [preview.channel]);
  const errorText =
    preview.error || (error?.channel === preview.channel ? error.text : "");
  return (
    <section className="preview-panel" aria-labelledby="preview-title">
      <div className="pane-heading">
        <h2 id="preview-title">
          Preview <span className="label">/PROJECT</span>
        </h2>
        <div className="preview-tools">
          <button
            id="viewport"
            className="icon-button"
            aria-label={`Switch to ${narrow ? "wide" : "narrow"} preview`}
            title="Switch preview width"
            onClick={() => setNarrow(!narrow)}
          >
            ▯
          </button>
          <button
            id="refresh"
            className="icon-button"
            aria-label="Refresh preview"
            title="Refresh preview"
            onClick={() => session.refresh()}
          >
            ↻
          </button>
          <button
            id="export"
            className="text-button"
            onClick={() => session.exportApp()}
          >
            Export
          </button>
          <button
            id="reset"
            className="text-button"
            disabled={state.busy || (state.bootStarted && !state.linuxReady)}
            onClick={() => session.reset()}
          >
            Reset
          </button>
        </div>
      </div>
      <div className="preview-address">
        <span className="dot" />
        <span>workspace / index.html</span>
        <span id="preview-status">
          {state.linuxReady ? "Shared with Linux" : "Starter app"}
        </span>
      </div>
      <div className={`preview-stage${narrow ? " narrow" : ""}`}>
        <iframe
          ref={frame}
          id="preview"
          title="Live app preview"
          sandbox="allow-scripts"
          srcDoc={preview.html}
        />
      </div>
      <div className="preview-footer">
        <span>
          <span className="dot" /> HTML + CSS + JavaScript
        </span>
        <span id="revision">
          {state.revision
            ? `Revision ${state.revision} · saved in workspace`
            : "Ready for your first edit"}
        </span>
      </div>
      <p id="preview-error" role="status" hidden={!errorText}>
        {errorText ? `Preview: ${errorText}` : ""}
      </p>
    </section>
  );
}
