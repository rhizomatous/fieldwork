export function Header() {
  return (
    <header className="app-header">
      <a className="wordmark" href="/" aria-label="Fieldwork home">
        <span className="brand-symbol" aria-hidden="true">
          ⌘
        </span>{" "}
        fieldwork<span className="edition">LOCAL AGENT LAB</span>
      </a>
      <div className="header-note">
        <span className="dot"></span> Your browser is the computer
        <span className="version">EXPERIMENT 001</span>
      </div>
    </header>
  );
}
