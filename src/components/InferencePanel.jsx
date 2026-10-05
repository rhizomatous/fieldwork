import { models } from "../session.js";
import { Status } from "./Status.jsx";
export function InferencePanel({ state, session }) {
  return (
    <section className="model-panel" aria-labelledby="model-title">
      <div className="pane-heading">
        <h2 id="model-title">Local inference</h2>
        <Status id="model-state" value={state.modelStatus} />
      </div>
      <div className="model-controls">
        <div className="model-select">
          <label htmlFor="model">MODEL</label>
          <select
            id="model"
            value={state.model}
            onChange={(event) => session.selectModel(event.target.value)}
            disabled={state.busy || state.loading}
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </div>
        <button
          id="load"
          className="button"
          onClick={() => session.load()}
          disabled={state.busy || state.loading || !state.gpuAvailable}
        >
          {state.loadLabel}
        </button>
      </div>
      <p id="load-detail" className="model-detail">
        {state.loadDetail}
      </p>
      <progress
        id="load-progress"
        max="1"
        value={state.progress}
        hidden={!state.loading}
        aria-label="Model loading progress"
      ></progress>
      <dl className="metrics">
        <div>
          <dt>FIRST TOKEN</dt>
          <dd id="ttft">
            {state.ttft}
            <small>seconds</small>
          </dd>
        </div>
        <div>
          <dt>GENERATION</dt>
          <dd id="speed">
            {state.speed}
            <small>tokens / sec</small>
          </dd>
        </div>
        <div>
          <dt>PREFILL</dt>
          <dd id="context">
            {state.prefill}
            <small>tokens this call</small>
          </dd>
        </div>
      </dl>
      <div className="inference-footer">
        <span id="gpu">{state.gpuLabel}</span>
        <span id="inference-note">{state.inferenceNote}</span>
      </div>
    </section>
  );
}
