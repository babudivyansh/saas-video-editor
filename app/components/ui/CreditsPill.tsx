import Link from "next/link";

function IcZap() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0" aria-hidden>
      <defs>
        <linearGradient id="zap-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--brand)" />
          <stop offset="55%" stopColor="var(--accent-violet)" />
          <stop offset="100%" stopColor="var(--accent-fuchsia)" />
        </linearGradient>
      </defs>
      <path fill="url(#zap-grad)" d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

interface CreditsPillProps {
  credits: number;
  href?: string;
}

export function CreditsPill({ credits, href = "/billing?tab=usage" }: CreditsPillProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 bg-tint-violet hover:bg-violet-100 rounded-full px-3 py-1.5 transition-all hover:scale-[1.03]"
    >
      <IcZap />
      <span className="text-sm font-bold text-ink">{credits}</span>
      <span className="text-xs text-ink-soft font-medium">credits</span>
    </Link>
  );
}
