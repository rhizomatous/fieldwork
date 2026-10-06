import { useRef, useState } from "react";

const suggestions = [
  [
    "A warmer palette",
    "Change the page to a warm terracotta color palette. Keep the layout and behavior.",
  ],
  [
    "Add a reset button",
    "Add a reset button that resets the little joys counter to zero.",
  ],
];
export function PromptComposer({ state, session }) {
  const [prompt, setPrompt] = useState("");
  const input = useRef(null);
  const canSend = state.linuxReady && state.modelReady && !state.busy;
  async function submit(event) {
    event.preventDefault();
    if (!canSend || !prompt.trim()) return;
    const text = prompt;
    setPrompt("");
    await session.send(text);
  }
  return (
    <div className="prompt-area">
      <div className="suggestions" aria-label="Example prompts">
        {suggestions.map(([label, text]) => (
          <button
            key={label}
            onClick={() => {
              setPrompt(text);
              input.current.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <form id="prompt-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="prompt">
          Ask the agent to change the app
        </label>
        <textarea
          ref={input}
          id="prompt"
          rows="2"
          placeholder="What should we change?"
          maxLength={4000}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              event.currentTarget.form.requestSubmit();
            }
          }}
        />
        <div className="composer-footer">
          <span id="composer-hint">
            {state.resettingChat
              ? "Resetting conversation…"
              : state.busy
                ? "Pi is working inside Linux…"
                : canSend
                  ? "Enter to send · Shift + Enter for a new line"
                  : "Start Linux and load a model to begin"}
          </span>
          <button
            id="stop"
            className="button"
            type="button"
            hidden={!state.busy || state.resettingChat}
            onClick={() => session.stop()}
          >
            Stop
          </button>
          <button
            id="send"
            className="button primary"
            disabled={!canSend}
            type="submit"
          >
            Send <span aria-hidden="true">↑</span>
          </button>
        </div>
      </form>
    </div>
  );
}
