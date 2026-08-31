import Link from "next/link";

export type CardTint = "blue" | "violet" | "fuchsia" | "amber" | "emerald" | "rose" | "none";

interface CardProps {
  tint?: CardTint;
  /** Hover lift + shadow; set automatically when href is given. */
  interactive?: boolean;
  /** Wraps the card in a next/link when the whole card is clickable. */
  href?: string;
  padding?: "none" | "sm" | "md";
  /** Static shadow-card elevation for a non-interactive card that should still
   * read as raised (e.g. a page-level content panel) — independent of
   * `interactive`, which is about the *hover* shadow/lift, not a resting one. */
  shadow?: boolean;
  className?: string;
  children: React.ReactNode;
}

const TINT: Record<CardTint, string> = {
  none: "bg-white border-card-border",
  blue: "bg-tint-blue border-blue-100",
  violet: "bg-tint-violet border-violet-100",
  fuchsia: "bg-tint-fuchsia border-fuchsia-100",
  amber: "bg-tint-amber border-amber-100",
  emerald: "bg-tint-emerald border-emerald-100",
  rose: "bg-tint-rose border-rose-100",
};

const PADDING = { none: "", sm: "p-4", md: "p-5" } as const;

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
