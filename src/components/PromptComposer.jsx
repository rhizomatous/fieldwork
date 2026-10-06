import "./PromptComposer.css";
import { useState } from "react";

import { ChatBox } from "../design-system/ChatBox.jsx";

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
  const canSend = state.linuxReady && state.modelReady && !state.busy;
  const hint = state.resettingChat
    ? "Resetting conversation…"
    : state.busy
      ? "Pi is working inside Linux…"
      : canSend
        ? "Enter to send · Shift\u00a0+\u00a0Enter for a new line"
        : "Start Linux and load a model to begin";
  return (
    <div className="prompt-area">
      <ChatBox
        value={prompt}
        onChange={setPrompt}
        onSend={(text) => {
          setPrompt("");
          session.send(text);
        }}
        canSend={canSend}
        showStop={state.busy && !state.resettingChat}
        onStop={() => session.stop()}
        hint={hint}
        suggestions={suggestions}
        label="Ask the agent to change the app"
      />
    </div>
  );
}
