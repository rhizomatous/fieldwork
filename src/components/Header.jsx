import "./Header.css";
import { Wordmark } from "../design-system/Wordmark.jsx";
import { ThemeControl } from "./ThemeControl.jsx";
export function Header() {
  return (
    <header className="app-header">
      <Wordmark />
      <ThemeControl />
    </header>
  );
}
