import CodeMirror from "@uiw/react-codemirror";
import { useState } from "react";

import { errorMessage } from "../../shared/errors.ts";
import { Button } from "../design-system/Button.tsx";
import type { PanelProps, ProjectFile } from "../types.ts";

import { editorExtensions, editorTheme } from "./workspace-editor-config.ts";

import "./WorkspaceEditor.css";

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
  const locked = state.workspaceLocked;

  function getStatusText() {
    if (error) {
      return error;
    }
    if (conflict) {
      return "File changed in the workspace. Reload to use the latest version.";
    }
    if (state.savingFile === file) {
      return "Saving…";
    }
    switch (state.operation.type) {
      case "saving":
        return "Saving another file (read only)";
      case "resetting-chat":
        return "Resetting conversation (read only)";
      case "resetting-project":
        return "Resetting project (read only)";
      case "prompting":
      case "working":
        return "Agent is working (read only)";
    }
    if (dirty) {
      return "Unsaved changes";
    }
    return "Saved to workspace";
  }

  async function save() {
    if (!draft || !dirty || conflict || locked) {
      return;
    }
    setError("");
    try {
      await session.saveFile(file, draft.text, draft.base);
      setDraft(null);
    } catch (cause) {
      setError(errorMessage(cause));
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
        theme={editorTheme}
        extensions={editorExtensions[file]}
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
        <span role="status">{getStatusText()}</span>
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
