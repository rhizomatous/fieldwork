import type { ReactNode } from "react";

import "./RuntimePanels.css";

export function RuntimePanels({ children }: { children: ReactNode }) {
  return <div className="runtime-panels">{children}</div>;
}
