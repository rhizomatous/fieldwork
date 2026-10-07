import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

export const editorTheme = EditorView.theme({
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

export const editorExtensions = Object.fromEntries(
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
