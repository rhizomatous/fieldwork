import type { FormEvent } from "react";

import "./ChatBox.css";
import { useId, useRef } from "react";

import { Button } from "./Button.tsx";

type ChatBoxProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: (value: string) => void;
  canSend: boolean;
  onStop?: () => void;
  showStop?: boolean;
  hint?: string;
  suggestions?: [string, string][];
  label?: string;
  placeholder?: string;
  maxLength?: number;
};

export function ChatBox({
  value,
  onChange,
  onSend,
  canSend,
  onStop,
  showStop = false,
  hint,
  suggestions = [],
  label = "Message",
  placeholder = "What should we change?",
  maxLength = 4000,
}: ChatBoxProps) {
  const id = useId();
  const input = useRef<HTMLTextAreaElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSend && value.trim()) {
      onSend(value);
    }
  }

  return (
    <div className="chatbox">
      {suggestions.length > 0 && (
        <div className="suggestions" aria-label="Example prompts">
          {suggestions.map(([suggestionLabel, text]) => (
            <Button
              variant="secondary"
              size="small"
              key={suggestionLabel}
              onClick={() => {
                onChange(text);
                input.current?.focus();
              }}
            >
              {suggestionLabel}
            </Button>
          ))}
        </div>
      )}
      <form className="chatbox-form" onSubmit={submit}>
        <label className="sr-only" htmlFor={id}>
          {label}
        </label>
        <textarea
          ref={input}
          className="chatbox-input"
          id={id}
          aria-describedby={hint ? `${id}-hint` : undefined}
          rows={2}
          placeholder={placeholder}
          maxLength={maxLength}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="composer-footer">
          <span id={`${id}-hint`}>{hint}</span>
          <Button hidden={!showStop} onClick={onStop}>
            Stop
          </Button>
          <Button variant="primary" disabled={!canSend} type="submit">
            Send <span aria-hidden="true">↑</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
