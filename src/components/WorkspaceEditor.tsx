import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import CodeMirror from "@uiw/react-codemirror";
import { useState } from "react";

import { Button } from "../design-system/Button.tsx";
import type { PanelProps, ProjectFile } from "../types.ts";

import "./WorkspaceEditor.css";

// CSS tokens update in place with Fieldwork's theme, preserving selection and undo.
const theme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--color-text)",
    backgroundColor: "var(--color-bg-surface)",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-family-mono)",
    fontSize: "var(--font-size-body)",
    lineHeight: "1.7",
    overflow: "auto",
  },
  ".cm-content": { padding: "16px 0", caretColor: "var(--color-accent)" },
  ".cm-line": { padding: "0 16px" },
  "&.cm-focused": { outline: "none" },
  ".cm-gutters": {
    backgroundColor: "var(--color-bg-surface)",
    color: "var(--color-text-muted)",
    borderColor: "var(--color-border)",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px" },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "var(--color-bg-hover)",
  },
  // Selection is drawn behind the text; an opaque active line would hide it.
  "&[data-has-selection=true] .cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--color-accent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "var(--color-code-selection)" },
  ".cm-matchingBracket": {
    backgroundColor: "var(--color-code-selection)",
    outline: "1px solid var(--color-border-strong)",
  },
  ".cm-panels, .cm-tooltip": {
    backgroundColor: "var(--color-bg-canvas)",
    color: "var(--color-text)",
    borderColor: "var(--color-border)",
  },
  ".cm-searchMatch": { backgroundColor: "var(--color-code-selection)" },
});
const highlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [tags.keyword, tags.operator], color: "var(--color-code-keyword)" },
    {
      tag: [tags.string, tags.regexp, tags.tagName],
      color: "var(--color-accent)",
    },
    {
      tag: [tags.number, tags.bool, tags.null],
      color: "var(--color-code-number)",
    },
    {
      tag: [
        tags.propertyName,
        tags.attributeName,
        tags.function(tags.variableName),
      ],
      color: "var(--color-code-property)",
    },
    {
      tag: tags.comment,
      color: "var(--color-text-muted)",
      fontStyle: "italic",
    },
  ]),
);
const languages = {
  "index.html": html(),
  "style.css": css(),
  "script.js": javascript(),
};
const extensions = Object.fromEntries(
  Object.entries(languages).map(([file, language]) => [
    file,
    [
      language,
      highlighting,
      EditorView.lineWrapping,
      EditorView.editorAttributes.of((view) => ({
        "data-has-selection": String(
          view.state.selection.ranges.some((range) => !range.empty),
        ),
      })),
      EditorView.contentAttributes.of({ "aria-label": `${file} source code` }),
    ],
  ]),
);

export default function WorkspaceEditor({
  file,
  state,
  session,
}: PanelProps & { file: ProjectFile }) {
  const source = state.files?.[file] ?? "";
  const [draft, setDraft] = useState<{ base: string; text: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const dirty = draft !== null && draft.text !== source;
  const conflict = dirty && draft.base !== source;
  const locked = state.busy || !!state.savingFile;

  async function save() {
    if (!draft || !dirty || conflict || locked) {
      return;
    }
    setError("");
    try {
      await session.saveFile(file, draft.text, draft.base);
      setDraft(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <div
      className="workspace-editor"
      onKeyDownCapture={(event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "s"
        ) {
          event.preventDefault();
          void save();
        }
      }}
    >
      <CodeMirror
        value={draft?.text ?? source}
        theme={theme}
        extensions={extensions[file]}
        basicSetup={{
          foldGutter: false,
          highlightActiveLine: true,
          autocompletion: false,
        }}
        indentWithTab={false}
        editable={!locked}
        readOnly={locked}
        aria-label={`${file} source code`}
        onChange={(text) => {
          setError("");
          setDraft((previous) =>
            text === source ? null : { base: previous?.base ?? source, text },
          );
        }}
      />
      <div className="editor-footer">
        <span role="status">
          {error ||
            (conflict
              ? "File changed in the workspace. Reload to use the latest version."
              : state.savingFile === file
                ? "Saving…"
                : state.busy
                  ? "Agent is editing · read only"
                  : dirty
                    ? "Unsaved changes"
                    : "Saved to workspace")}
        </span>
        {draft && (
          <Button
            variant="ghost"
            disabled={!!state.savingFile}
            onClick={() => {
              setDraft(null);
              setError("");
            }}
          >
            {conflict ? "Reload file" : "Discard"}
          </Button>
        )}
        <Button
          size="small"
          disabled={!dirty || conflict || locked}
          onClick={save}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
