import Link from "next/link";

type ButtonVariant = "primary" | "secondary" | "ghost" | "inverse" | "danger" | "link";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a next/link instead of a <button> when present. */
  href?: string;
  /** Trailing icon (e.g. chevron). */
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
  /**
   * Native <button> type — omitted by default, which means the browser's own
   * default ("submit") applies exactly as before this prop existed. Pass
   * "button" for anything inside a <form> that must NOT trigger submission
   * (e.g. a Cancel action next to a submit button).
   */
  type?: "button" | "submit" | "reset";
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: "grad-brand text-white shadow-glow hover:shadow-glow-hover hover:brightness-105",
  secondary: "bg-white border border-card-border text-ink hover:bg-tint-blue",
  // ghost is designed for use on gradient/hero surfaces. On a white card it is
  // white-on-white and effectively invisible — which is exactly how the Social
  // Tracker's Disconnect button shipped. Use `danger` for destructive actions
  // on light surfaces instead of reaching for this one.
  ghost: "bg-white/15 text-white border border-white/25 hover:bg-white/25",
  inverse: "bg-white text-ink shadow-card hover:shadow-card-hover",
  // Destructive, on a light surface. Outlined rather than filled: a solid red
  // button pulls more attention than "Disconnect" deserves sitting next to a
  // routine "Re-sync", but it must still read as dangerous before the click.
  danger: "bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300",
  // Borderless inline text action, for dense tables with several row-level
  // actions (e.g. admin's Suspend/Ban/Release/Reject) where a pill per
  // action is too heavy. No default color — callers set one via className
  // (e.g. text-red-500) to carry the action's own semantic weight, same as
  // the existing className color overrides on the other variants.
  link: "bg-transparent hover:underline",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "text-xs px-3 py-1.5 gap-1",
  md: "text-sm px-4 py-2 gap-1.5",
  lg: "text-sm px-6 py-3 gap-2",
};

export function Button({ variant = "primary", size = "md", href, icon, onClick, disabled, className = "", children, type }: ButtonProps) {
  const cls = variant === "link"
    ? `inline-flex items-center font-semibold whitespace-nowrap text-xs ${VARIANT.link} ${disabled ? "opacity-50 pointer-events-none" : ""} ${className}`
    : `inline-flex items-center justify-center font-semibold rounded-full transition-all whitespace-nowrap ${VARIANT[variant]} ${SIZE[size]} ${disabled ? "opacity-50 pointer-events-none" : ""} ${className}`;
  if (href) {
    // onClick is forwarded here too: next/link accepts it natively, and
    // dropping it silently meant a tracked or instrumented link rendered fine
    // and simply never fired its handler. Passing onClick from a *server*
    // component is still a build error, as it should be.
    return (
      <Link href={href} className={cls} onClick={onClick}>
        {children}
        {icon}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {children}
      {icon}
    </button>
  );
}
