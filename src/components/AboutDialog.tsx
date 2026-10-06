import type { RefObject } from "react";

import { Button } from "../design-system/Button.tsx";

import "./AboutDialog.css";

export function AboutDialog({
  dialogRef,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
}) {
  return (
    <dialog
      ref={dialogRef}
      className="about-dialog"
      aria-labelledby="about-title"
    >
      <div className="about-heading">
        <h2 id="about-title">What is Fieldwork?</h2>
        <Button
          variant="ghost"
          onClick={() => dialogRef.current?.close()}
          autoFocus
        >
          Close
        </Button>
      </div>
      <div className="about-copy">
        <p>
          Fieldwork is a tech demo from{" "}
          <a target="_blank" rel="noreferrer" href="https://rhizomato.us/">
            Atelier Rhizome
          </a>
          . It demonstrates{" "}
          <strong>
            a complete agentic development environment that runs entirely
            locally, entirely within your browser
          </strong>
          . Yes, you read that right: there is no backend, and there are no
          calls to inference providers! Here's how that works:
        </p>
        <ul>
          <li>
            The dev VM is powered by{" "}
            <a target="_blank" rel="noreferrer" href="https://wanix.dev/">
              Wanix
            </a>
            , a lovely little tool which provides WASM-based Unix-like sandboxes
            on the web.
          </li>
          <li>
            The harness is{" "}
            <a target="_blank" rel="noreferrer" href="https://pi.dev/">
              Pi
            </a>
            , running within the Wanix VM.
          </li>
          <li>
            Project files are stored in your browser's{" "}
            <a
              target="_blank"
              rel="noreferrer"
              href="https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system"
            >
              Origin Private File System
            </a>
            , so they can survive across sessions.
          </li>
          <li>
            Inference is powered by{" "}
            <a
              target="_blank"
              rel="noreferrer"
              href="https://huggingface.co/Qwen/Qwen3-4B"
            >
              Qwen3 4B
            </a>{" "}
            running on{" "}
            <a target="_blank" rel="noreferrer" href="https://webllm.mlc.ai/">
              WebLLM
            </a>
            , an in-browser inference engine using{" "}
            <a
              target="_blank"
              rel="noreferrer"
              href="https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API"
            >
              WebGPU
            </a>
            .
          </li>
        </ul>
        <p>
          If you're curious about specifics,{" "}
          <a
            target="_blank"
            rel="noreferrer"
            href="https://github.com/rhizomatous/fieldwork"
          >
            check it out on GitHub
          </a>{" "}
          to see how it's wired together!
        </p>
        <p className="about-signature">
          – <a href="mailto:hey@vivsha.ws">v</a>
        </p>
      </div>
    </dialog>
  );
}
