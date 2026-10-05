import { useLayoutEffect, useRef } from "react";
import { WorkspaceSetup } from "./WorkspaceSetup.jsx";

export function Conversation({ state, onBoot }) {
  const log = useRef(null);
  useLayoutEffect(() => {
    log.current.scrollTop = log.current.scrollHeight;
  }, [state.messages]);
  return (
    <div
      ref={log}
      className="conversation"
      id="conversation"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
    >
      <WorkspaceSetup state={state} onBoot={onBoot} />
      {state.messages.map((item) =>
        item.tool ? (
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
