import { useLayoutEffect, useRef } from "react";

import "./Conversation.css";
import { EmptyState } from "../design-system/EmptyState.tsx";
import type { SessionState } from "../types.ts";

export function Conversation({ state }: { state: SessionState }) {
  const log = useRef<HTMLDivElement>(null);
  const ready = state.linuxReady && state.modelReady;
  const emptyTitle = ready
    ? "What would you like to change?"
    : state.linuxReady
      ? "Load a model to begin"
      : state.modelReady
        ? "Start Linux to begin"
        : "Start Linux and load a model";
  useLayoutEffect(() => {
    if (log.current) {
      log.current.scrollTop = log.current.scrollHeight;
    }
    // New messages trigger scrolling; metrics updates must not move the viewport.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [state.messages]);
  return (
    <div
      ref={log}
      className={`conversation${state.messages.length === 0 ? " is-empty" : ""}`}
      id="conversation"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
    >
      {state.messages.length === 0 && (
        <EmptyState headingLevel={2} title={emptyTitle}>
          {ready
            ? "Describe a change to your app, and Fieldwork will get to work."
            : "Use the panels below. Once both are ready, you can ask Fieldwork to edit your app."}
        </EmptyState>
      )}
      {state.messages.map((item) =>
        item.type === "tool" ? (
          <div key={item.id} className="tool-event">
            <strong>{item.tool} </strong>
            {item.text}
          </div>
        ) : (
          <article
            key={item.id}
            className={`message${item.error ? " error" : ""}`}
          >
            <span className="speaker">{item.who}</span>
            <p>{item.text}</p>
          </article>
        ),
      )}
    </div>
  );
}
