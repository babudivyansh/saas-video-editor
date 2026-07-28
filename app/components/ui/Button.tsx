import Link from "next/link";

type ButtonVariant = "primary" | "secondary" | "ghost" | "inverse";
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
  // ghost is designed for use on gradient/hero surfaces
  ghost: "bg-white/15 text-white border border-white/25 hover:bg-white/25",
  inverse: "bg-white text-ink shadow-card hover:shadow-card-hover",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "text-xs px-3 py-1.5 gap-1",
  md: "text-sm px-4 py-2 gap-1.5",
  lg: "text-sm px-6 py-3 gap-2",
};

export function Button({ variant = "primary", size = "md", href, icon, onClick, disabled, className = "", children, type }: ButtonProps) {
  const cls = `inline-flex items-center justify-center font-semibold rounded-full transition-all whitespace-nowrap ${VARIANT[variant]} ${SIZE[size]} ${disabled ? "opacity-50 pointer-events-none" : ""} ${className}`;
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
