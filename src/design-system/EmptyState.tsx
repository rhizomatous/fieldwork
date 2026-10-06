import type { ComponentProps, ReactNode } from "react";

import "./EmptyState.css";

type EmptyStateProps = Omit<ComponentProps<"div">, "title"> & {
  title: ReactNode;
  children: ReactNode;
  headingLevel?: 2 | 3;
};

export function EmptyState({
  title,
  children,
  headingLevel = 2,
  className = "",
  ...props
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div {...props} className={`ds-empty-state ${className}`.trim()}>
      <Heading>{title}</Heading>
      <p>{children}</p>
    </div>
  );
}
