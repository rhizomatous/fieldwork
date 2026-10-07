import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

import "./PreviewPanel.css";
import { Button } from "../design-system/Button.tsx";
import { EmptyState } from "../design-system/EmptyState.tsx";
import { buildPreview } from "../protocol.js";
import type { PanelProps, ProjectFile, SessionState } from "../types.ts";

const WorkspaceEditor = lazy(() => import("./WorkspaceEditor.tsx"));
const tabs = ["Preview", "index.html", "script.js", "style.css"] as const;
type WorkspaceTab = (typeof tabs)[number];

function getEmptyWorkspaceCopy(state: SessionState) {
  if (state.agentStatus.kind === "error") {
    return {
      title: "Workspace unavailable",
      description: "Open the console for details, then reload to try again.",
    };
  }
  if (state.bootStarted) {
    return {
      title: "Opening your workspace…",
      description: "Your app will appear once Linux has opened its files.",
    };
  }
  return {
    title: "Your workspace preview",
    description: "Start Linux to open your workspace.",
  };
}

export function PreviewPanel({ state, session }: PanelProps) {
  const [tab, setTab] = useState<WorkspaceTab>("Preview");
  const [editorsOpened, setEditorsOpened] = useState(false);
  function selectTab(next: WorkspaceTab) {
    setTab(next);
    if (next !== "Preview") {
      setEditorsOpened(true);
    }
  }
  const [error, setError] = useState<{ channel: string; text: string } | null>(
    null,
  );
  const frame = useRef<HTMLIFrameElement>(null);
  // Metrics and conversation updates must not reload the user's running app.
  const preview = useMemo(() => {
    const channel = crypto.randomUUID();
    if (!state.files) {
      return { channel, html: "" };
    }
    try {
      return { channel, html: buildPreview(state.files, channel) };
    } catch (cause) {
      const previewError =
        cause instanceof Error ? cause : new Error(String(cause));
      return { channel, html: "", error: previewError.message };
    }
    // Explicit Refresh must rebuild srcDoc even when the file contents are unchanged.
    // oxlint-disable-next-line react/memo-dependencies, react/exhaustive-deps
  }, [state.files, state.previewVersion]);
  useEffect(() => {
    function onMessage(event: MessageEvent) {
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
  const emptyWorkspace = getEmptyWorkspaceCopy(state);
  return (
    <section className="preview-panel" aria-label="Workspace">
      <div className="pane-heading">
        <div
          className="workspace-tabs"
          role="tablist"
          aria-label="Workspace views"
        >
          {tabs.map((name, index) => (
            <button
              key={name}
              id={`tab-${name}`}
              role="tab"
              type="button"
              aria-selected={tab === name}
              aria-controls={`panel-${name}`}
              tabIndex={tab === name ? 0 : -1}
              onClick={() => selectTab(name)}
              onKeyDown={(event) => {
                let next = index;
                if (event.key === "ArrowRight") {
                  next = (index + 1) % tabs.length;
                } else if (event.key === "ArrowLeft") {
                  next = (index + tabs.length - 1) % tabs.length;
                } else if (event.key === "Home") {
                  next = 0;
                } else if (event.key === "End") {
                  next = tabs.length - 1;
                } else {
                  return;
                }
                event.preventDefault();
                selectTab(tabs[next]);
                document.getElementById(`tab-${tabs[next]}`)?.focus();
              }}
            >
              {name}
            </button>
          ))}
        </div>
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
      <div
        className="preview-stage"
        id="panel-Preview"
        role="tabpanel"
        aria-labelledby="tab-Preview"
        hidden={tab !== "Preview"}
      >
        {state.files ? (
          <iframe
            ref={frame}
            id="preview"
            title="Live app preview"
            sandbox="allow-scripts allow-forms"
            srcDoc={preview.html}
          />
        ) : (
          <EmptyState
            headingLevel={3}
            title={emptyWorkspace.title}
            role="status"
          >
            {emptyWorkspace.description}
          </EmptyState>
        )}
      </div>
      {tabs
        .filter((name): name is ProjectFile => name !== "Preview")
        .map((file) => (
          <div
            key={file}
            className="editor-panel"
            id={`panel-${file}`}
            role="tabpanel"
            aria-labelledby={`tab-${file}`}
            hidden={tab !== file}
          >
            {state.files && editorsOpened ? (
              <Suspense
                fallback={
                  <div className="editor-placeholder">Loading editor…</div>
                }
              >
                <WorkspaceEditor file={file} state={state} session={session} />
              </Suspense>
            ) : (
              <div className="editor-placeholder">
                <EmptyState title="Your workspace files" headingLevel={3}>
                  Start Linux to open and edit {file}.
                </EmptyState>
              </div>
            )}
          </div>
        ))}
      <p
        id="preview-error"
        role="status"
        hidden={!errorText || tab !== "Preview"}
      >
        {errorText ? `Preview: ${errorText}` : ""}
      </p>
    </section>
  );
}
