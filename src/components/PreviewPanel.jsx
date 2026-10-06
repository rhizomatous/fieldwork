import { useEffect, useMemo, useRef, useState } from "react";
import { buildPreview } from "../protocol.js";

export function PreviewPanel({ state, session }) {
  const [narrow, setNarrow] = useState(false);
  const [error, setError] = useState(null);
  const frame = useRef(null);
  // Metrics and conversation updates must not reload the user's running app.
  const preview = useMemo(() => {
    const channel = crypto.randomUUID();
    if (!state.files) return { channel, html: "" };
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
            disabled={!state.files}
            id="viewport"
            className="icon-button"
            aria-label={`Switch to ${narrow ? "wide" : "narrow"} preview`}
            title="Switch preview width"
            onClick={() => setNarrow(!narrow)}
          >
            ▯
          </button>
          <button
            disabled={!state.files}
            id="refresh"
            className="icon-button"
            aria-label="Refresh preview"
            title="Refresh preview"
            onClick={() => session.refresh()}
          >
            ↻
          </button>
          <button
            disabled={!state.files}
            id="export"
            className="text-button"
            onClick={() => session.exportApp()}
          >
            Export
          </button>
          <button
            id="reset"
            className="text-button"
            disabled={state.busy || !state.linuxReady}
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
          {state.files ? "Shared with Linux" : "Workspace not open"}
        </span>
      </div>
      <div className={`preview-stage${narrow ? " narrow" : ""}`}>
        {state.files ? (
          <iframe
            ref={frame}
            id="preview"
            title="Live app preview"
            sandbox="allow-scripts"
            srcDoc={preview.html}
          />
        ) : (
          <div className="preview-placeholder" role="status">
            <h3>
              {state.agentStatus.kind === "error"
                ? "Workspace unavailable"
                : state.bootStarted
                  ? "Opening your workspace…"
                  : "Your workspace preview"}
            </h3>
            <p>
              {state.agentStatus.kind === "error"
                ? "Open the boot console for details, then reload to try again."
                : state.bootStarted
                  ? "Your app will appear once Linux has opened its files."
                  : "Start Linux to open your workspace."}
            </p>
          </div>
        )}
      </div>
      <div className="preview-footer">
        <span>
          <span className="dot" /> HTML + CSS + JavaScript
        </span>
        <span id="revision">
          {state.revision
            ? `Revision ${state.revision} · saved in workspace`
            : "Waiting for workspace"}
        </span>
      </div>
      <p id="preview-error" role="status" hidden={!errorText}>
        {errorText ? `Preview: ${errorText}` : ""}
      </p>
    </section>
  );
}
