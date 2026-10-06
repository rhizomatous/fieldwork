import "./Wordmark.css";

/** @param {{href?: string, label?: string}} props */
export function Wordmark({ href = "/", label = "Fieldwork home" }) {
  return (
    <a className="wordmark" href={href} aria-label={label}>
      <span className="brand-symbol" aria-hidden="true">
        ⌘
      </span>{" "}
      <span>
        fieldwork <span className="brand-aide">aide</span>
      </span>
    </a>
  );
}
