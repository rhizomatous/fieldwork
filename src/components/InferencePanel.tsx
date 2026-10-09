import { MODEL } from "../../shared/inference-config.ts";
import { Button } from "../design-system/Button.tsx";

import "./InferencePanel.css";
import { StatusIndicator } from "../design-system/StatusIndicator.tsx";
import type { PanelProps } from "../types.ts";

export function InferencePanel({ state, session }: PanelProps) {
  const failed = state.modelStatus.kind === "error";
  const showDetail = state.loading || failed || !state.gpuAvailable;
  return (
    <section className="model-panel" aria-labelledby="model-title">
      <h2 id="model-title">Inference</h2>
      <div className="runtime-status">
        <span>{MODEL.label}</span>
        <StatusIndicator id="model-state" value={state.modelStatus} />
      </div>
      <div
        className="decode-stat"
        aria-label={
          state.speed === "—"
            ? "Generation speed not available yet"
            : `${state.speed} tokens per second`
        }
      >
        <span className="decode-label">Speed</span>
        <span className="decode-value">
          <span id="speed">{state.speed}</span>
          <span className="decode-unit">tok/s</span>
        </span>
      </div>
      <Button
        id="load"
        variant="secondary"
        onClick={() => session.load()}
        disabled={!state.canLoadModel}
      >
        {state.loadLabel}
      </Button>
      <progress
        id="load-progress"
        max="1"
        value={state.progress}
        hidden={!state.loading}
        aria-label="Model loading progress"
      />
      {showDetail && (
        <p
          id="load-detail"
          className={`runtime-detail${failed ? " runtime-detail-error" : ""}`}
          role={failed ? "alert" : "status"}
        >
          {failed && (
            <svg
              className="runtime-error-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v6m0 4h.01" />
            </svg>
          )}
          <span>{state.loadDetail}</span>
        </p>
      )}
    </section>
  );
}
