// SVG credit ring — brand-gradient stroke on a tinted track. Shared by the
// billing page and the profile credits page.
export function CreditRing({ used, total, size = 72 }: { used: number; total: number; size?: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(used / total, 1) : 0;
  const dash = pct * circ;
  return (
    // The number inside the ring is an SVG <text> node, which a screen reader
    // reads as a bare figure with no unit or context. Label the whole graphic
    // instead and hide the decorative interior.
    <svg
      width={size}
      height={size}
      viewBox="0 0 72 72"
      className="flex-shrink-0"
      role="img"
      aria-label={total > 0 ? `${used} of ${total} monthly credits used` : `${used} credits used`}
    >
      <defs>
        <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--brand)" />
          <stop offset="55%" stopColor="var(--accent-violet)" />
          <stop offset="100%" stopColor="var(--accent-fuchsia)" />
        </linearGradient>
      </defs>
      <circle cx="36" cy="36" r={r} fill="none" stroke="var(--tint-blue)" strokeWidth="7" />
      <circle
        cx="36" cy="36" r={r} fill="none"
        stroke="url(#ring-grad)" strokeWidth="7"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 36 36)"
      />
      <text x="36" y="39" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--ink)" aria-hidden="true">
        {used}
      </text>
    </svg>
  );
}
