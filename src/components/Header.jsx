import "./Header.css";
import { useRef } from "react";
import { Button } from "../design-system/Button.jsx";
import { AboutDialog } from "./AboutDialog.jsx";
import { Wordmark } from "../design-system/Wordmark.jsx";
import { ThemeControl } from "./ThemeControl.jsx";
export function Header() {
  const about = useRef(null);
  return (
    <header className="app-header">
      <Wordmark />
      <div className="header-actions">
        <Button variant="secondary" size="small" onClick={() => about.current.showModal()}>
          What is this?
        </Button>
        <ThemeControl />
      </div>
      <AboutDialog dialogRef={about} />
    </header>
  );
}
