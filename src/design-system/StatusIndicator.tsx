import type { ComponentProps } from "react";

import type { Status } from "../types.ts";

import "./StatusIndicator.css";

export function StatusIndicator({
  value,
  className = "",
  ...props
}: ComponentProps<"span"> & { value: Status }) {
  return (
    <span
      {...props}
      className={`status ${value.kind || ""} ${className}`.trim()}
    >
      {value.text}
    </span>
  );
}
