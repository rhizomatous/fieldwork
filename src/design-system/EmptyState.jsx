import "./EmptyState.css";
/** @param {{title: import('react').ReactNode, children: import('react').ReactNode,
 * headingLevel?: 2|3, className?: string, role?: string}} props
 */
export function EmptyState({
  title,
  children,
  headingLevel = 2,
  className = "",
  ...props
}) {
  const Heading = `h${headingLevel}`;
  return (
    <div {...props} className={`ds-empty-state ${className}`.trim()}>
      <Heading>{title}</Heading>
      <p>{children}</p>
    </div>
  );
}
