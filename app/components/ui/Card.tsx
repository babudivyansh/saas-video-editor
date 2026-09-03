import Link from "next/link";

export type CardTint = "blue" | "violet" | "fuchsia" | "amber" | "emerald" | "rose" | "none";

interface CardProps {
  tint?: CardTint;
  /** Hover lift + shadow; set automatically when href is given. */
  interactive?: boolean;
  /** Wraps the card in a next/link when the whole card is clickable. */
  href?: string;
  padding?: "none" | "sm" | "md" | "lg";
  /** Static shadow-card elevation for a non-interactive card that should still
   * read as raised (e.g. a page-level content panel) — independent of
   * `interactive`, which is about the *hover* shadow/lift, not a resting one. */
  shadow?: boolean;
  className?: string;
  children: React.ReactNode;
}

const TINT: Record<CardTint, string> = {
  none: "bg-panel border-card-border",
  blue: "bg-tint-blue border-tint-blue-border",
  violet: "bg-tint-violet border-tint-violet-border",
  fuchsia: "bg-tint-fuchsia border-tint-fuchsia-border",
  amber: "bg-tint-amber border-tint-amber-border",
  emerald: "bg-tint-emerald border-tint-emerald-border",
  rose: "bg-tint-rose border-tint-rose-border",
};

const PADDING = { none: "", sm: "p-4", md: "p-5", lg: "p-6" } as const;

export function Card({ tint = "none", interactive, href, padding = "none", shadow, className = "", children }: CardProps) {
  const lift = interactive || href;
  const cls = `block rounded-[var(--radius-card)] border overflow-hidden ${TINT[tint]} ${shadow ? "shadow-card" : ""} ${
    lift ? "transition-all hover:shadow-card-hover hover:-translate-y-0.5" : ""
  } ${PADDING[padding]} ${className}`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return <div className={cls}>{children}</div>;
}
