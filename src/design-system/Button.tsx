import type { ComponentProps } from "react";

import "./Button.css";

type ButtonProps = ComponentProps<"button"> & {
  variant?: "secondary" | "primary" | "ghost";
  size?: "default" | "small";
  iconOnly?: boolean;
  destructive?: boolean;
};

export function Button({
  variant = "secondary",
  size = "default",
  iconOnly = false,
  destructive = false,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  const classes = [
    "ds-button",
    `ds-button--${variant}`,
    `ds-button--${size}`,
    iconOnly && "ds-button--icon-only",
    destructive && "ds-button--destructive",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <button {...props} type={type} className={classes} />;
}
