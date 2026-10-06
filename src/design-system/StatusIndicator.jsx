import "./StatusIndicator.css";
/** Visible text makes status understandable without relying on color.
 * @param {{value: {text: string, kind?: ''|'ready'|'busy'|'error'}, id?: string, className?: string}} props
 */
export function StatusIndicator({ value, className = "", ...props }) {
  return (
    <span
      {...props}
      className={`status ${value.kind || ""} ${className}`.trim()}
    >
      {value.text}
    </span>
  );
}
