import { PROJECT_FILES } from "./project-files.js";
import type { ProjectFiles } from "./types.ts";

export function buildPreview(files: ProjectFiles, channel = ""): string {
  for (const file of PROJECT_FILES) {
    if (typeof files[file] !== "string") {
      throw new Error(`Missing ${file}`);
    }
  }

  const css = JSON.stringify(files["style.css"]).replace(/</g, "\\u003c");
  const js = JSON.stringify(files["script.js"]).replace(/</g, "\\u003c");
  const token = JSON.stringify(channel).replace(/</g, "\\u003c");
  const bootstrap = `<script>const channel=${token};addEventListener('error',e=>parent.postMessage({channel,type:'preview-error',message:e.message},'*'));addEventListener('unhandledrejection',e=>parent.postMessage({channel,type:'preview-error',message:String(e.reason)},'*'));</script>`;
  const style = `<script>{const s=document.createElement('style');s.textContent=${css};document.head.append(s)}</script>`;
  const script = `<script>{const s=document.createElement('script');s.textContent=${js};document.body.append(s)}</script>`;

  let html = files["index.html"];
  html = html.replace(
    /<link\b[^>]*href\s*=\s*["'](?:\.\/)?style\.css["'][^>]*>/gi,
    "",
  );
  html = html.replace(
    /<script\b[^>]*src\s*=\s*["'](?:\.\/)?script\.js["'][^>]*>\s*<\/script\s*>/gi,
    "",
  );

  // This demo has no external dependencies. Block network and nested frames.
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">`;
  const head = policy + bootstrap + style;

  html = /<head\b[^>]*>/i.test(html)
    ? html.replace(/<head\b[^>]*>/i, (match) => match + head)
    : head + html;

  return /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, script + "</body>")
    : html + script;
}
