export function WorkspaceSetup({ state, onBoot }) {
  return (
    <article className="welcome">
      <p className="kicker">A WHOLE WORKFLOW. ONE TAB.</p>
      <h2>
        Small changes.
        <br />
        Real agent.
      </h2>
      <p>
        Tell Pi what to make. It edits real files inside Linux, using a model
        running on your GPU.
      </p>
      <div className="setup-line">
        <span className="step-number">1</span>
        <div>
          <strong>Start the workspace</strong>
          <p>Boot Linux and Pi in your browser.</p>
        </div>
        <button
          id="boot"
          className="button primary"
          disabled={state.bootStarted}
          onClick={onBoot}
        >
          {state.bootLabel}
        </button>
      </div>
      <div className="setup-line">
        <span className="step-number">2</span>
        <div>
          <strong>Load a local model</strong>
          <p>Choose a model in the panel below.</p>
        </div>
        <span id="setup-model" className="step-check">
          {state.modelReady ? "Ready" : "Waiting"}
        </span>
      </div>
    </article>
  );
}
