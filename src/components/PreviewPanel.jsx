import { EmptyState } from "../design-system/EmptyState.jsx";
import { Button } from "../design-system/Button.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildPreview } from "../protocol.js";

export function PreviewPanel({ state, session }) {
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
        <h2 id="preview-title">Preview</h2>
        <div className="preview-tools">
          <Button
            disabled={!state.files}
            id="refresh"
            variant="ghost"
            size="small"
            iconOnly
            aria-label="Refresh preview"
            title="Refresh preview"
            onClick={() => session.refresh()}
          >
            ↻
          </Button>
        </div>
      </div>
      <div className="preview-stage">
        {state.files ? (
          <iframe
            ref={frame}
            id="preview"
            title="Live app preview"
            sandbox="allow-scripts"
            srcDoc={preview.html}
          />
        ) : (
          <EmptyState
            headingLevel={3}
            title={
              state.agentStatus.kind === "error"
                ? "Workspace unavailable"
                : state.bootStarted
                  ? "Opening your workspace…"
                  : "Your workspace preview"
            }
            role="status"
          >
            {state.agentStatus.kind === "error"
              ? "Open the console for details, then reload to try again."
              : state.bootStarted
                ? "Your app will appear once Linux has opened its files."
                : "Start Linux to open your workspace."}
          </EmptyState>
        )}
      </div>
      <p id="preview-error" role="status" hidden={!errorText}>
        {errorText ? `Preview: ${errorText}` : ""}
      </p>
    </section>
  );
}
