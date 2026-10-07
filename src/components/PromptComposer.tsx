import { useState } from "react";

import "./PromptComposer.css";
import { ChatBox } from "../design-system/ChatBox.tsx";
import type { PanelProps } from "../types.ts";

const suggestions: [string, string][] = [
  [
    "A warmer palette",
    "Change the page to a warm terracotta & cream color palette. Keep the layout and behavior.",
  ],
  [
    "Add a reset button",
    "Add a reset button that resets the little joys list to zero.",
  ],
];

export function PromptComposer({ state, session }: PanelProps) {
  const [prompt, setPrompt] = useState("");
  const canSend =
    state.linuxReady && state.modelReady && !state.busy && !state.savingFile;
  
  function getHint() {
    if (state.savingFile) {
      return "Saving workspace…";
    }
    if (state.resettingChat) {
      return "Resetting conversation…";
    }
    if (state.busy) {
      return "Pi is working inside Linux…";
    }
    if (canSend) {
      return "Enter to send · Shift\u00a0+\u00a0Enter for a new line";
    }
    return "Start Linux and load a model to begin";
  }

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
        hint={getHint()}
        suggestions={state.messages.length === 0 ? suggestions : []}
        label="Ask the agent to change the app"
      />
    </div>
  );
}
