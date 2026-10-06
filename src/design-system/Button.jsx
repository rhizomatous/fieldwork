import "./Button.css";

/** Native button props are forwarded, including ref, disabled and aria-*.
 * @param {import('react').ButtonHTMLAttributes<HTMLButtonElement> & {
 * variant?: 'secondary'|'primary'|'ghost',
 * size?: 'default'|'small', iconOnly?: boolean, destructive?: boolean
 * }} props
 */
export function Button({
  variant = "secondary",
  size = "default",
  iconOnly = false,
  destructive = false,
  className = "",
  type = "button",
  ...props
}) {
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
