import "./InferencePanel.css";
import { Button } from "../design-system/Button.jsx";
import { StatusIndicator } from "../design-system/StatusIndicator.jsx";

export function InferencePanel({ state, session }) {
  const showDetail =
    state.loading || state.modelStatus.kind === "error" || !state.gpuAvailable;
  return (
    <section className="model-panel" aria-labelledby="model-title">
      <h2 id="model-title">Inference</h2>
      <div className="runtime-status">
        <span>Qwen3 4B</span>
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
        disabled={state.busy || state.loading || !state.gpuAvailable}
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
        <p id="load-detail" className="runtime-detail" role="status">
          {state.loadDetail}
        </p>
      )}
    </section>
  );
}
