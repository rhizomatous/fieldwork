import "./Header.css";
import { useRef } from "react";

import { Button } from "../design-system/Button.tsx";
import { Wordmark } from "../design-system/Wordmark.tsx";

import { AboutDialog } from "./AboutDialog.tsx";
import { ThemeControl } from "./ThemeControl.tsx";

export function Header() {
  const about = useRef<HTMLDialogElement>(null);
  return (
    <header className="app-header">
      <Wordmark href={import.meta.env.BASE_URL} />
      <div className="header-actions">
        <Button
          variant="secondary"
          size="small"
          onClick={() => about.current?.showModal()}
        >
          What is this?
        </Button>
        <ThemeControl />
      </div>
      <AboutDialog dialogRef={about} />
    </header>
  );
}
