export function Header() {
  return (
    <header className="app-header">
      <a className="wordmark" href="/" aria-label="Fieldwork aide home">
        <span className="brand-symbol" aria-hidden="true">
          ⌘
        </span>{" "}
        <span>
          fieldwork <span className="brand-aide">aide</span>
        </span>
      </a>
    </header>
  );
}
