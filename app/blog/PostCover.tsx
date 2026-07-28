import type { BlogCategorySlug } from "./categories";

/**
 * The card artwork for a post that has no `hero` photograph.
 *
 * Drawn as inline SVG rather than shipped as image files: it stays crisp at
 * every card size, costs no extra request, and cannot drift out of sync with
 * the brand tokens. Each category gets its own palette and its own motif that
 * echoes what the posts in it are actually about, so a reader scanning the
 * grid can tell the posts apart at a glance instead of seeing six identical
 * gradients.
 *
 * A post that later gains a real `hero` image uses that instead — see PostCard.
 */

type Palette = { from: string; to: string; ink: string };

const PALETTES: Record<BlogCategorySlug, Palette> = {
  guide: { from: "#335CFF", to: "#7C3AED", ink: "#ffffff" },
  tutorial: { from: "#7C3AED", to: "#D946EF", ink: "#ffffff" },
  growth: { from: "#0EA5E9", to: "#335CFF", ink: "#ffffff" },
  captions: { from: "#D946EF", to: "#F97316", ink: "#ffffff" },
  "multi-language": { from: "#10B981", to: "#0EA5E9", ink: "#ffffff" },
  product: { from: "#3B5EFF", to: "#06B6D4", ink: "#ffffff" },
};

/** Each motif is drawn on a 320×180 canvas — the card's 16:9 cover area. */
function Motif({ category }: { category: BlogCategorySlug }) {
  const stroke = "rgba(255,255,255,0.92)";
  const soft = "rgba(255,255,255,0.38)";

  switch (category) {
    // One long recording fanning out into many short clips.
    case "guide":
      return (
        <g>
          <rect x="40" y="38" width="240" height="16" rx="8" fill={soft} />
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x={40 + i * 50} y="86" width="34" height="56" rx="8" fill={stroke} opacity={1 - i * 0.13} />
          ))}
        </g>
      );

    // A three-second hook: a countdown ring with a play mark.
    case "tutorial":
      return (
        <g>
          <circle cx="160" cy="90" r="52" fill="none" stroke={soft} strokeWidth="10" />
          <circle
            cx="160"
            cy="90"
            r="52"
            fill="none"
            stroke={stroke}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray="90 240"
            transform="rotate(-90 160 90)"
          />
          <path d="M148 72 L188 90 L148 108 Z" fill={stroke} />
        </g>
      );

    // Compounding reach: a rising bar series.
    case "growth":
      return (
        <g>
          {[28, 46, 68, 96, 130].map((h, i) => (
            <rect key={i} x={44 + i * 48} y={146 - h} width="30" height={h} rx="8" fill={stroke} opacity={0.55 + i * 0.11} />
          ))}
          <path d="M52 118 L100 96 L148 74 L196 50 L244 26" fill="none" stroke={soft} strokeWidth="5" strokeLinecap="round" />
        </g>
      );

    // Stacked subtitle lines with the active word highlighted.
    case "captions":
      return (
        <g>
          <rect x="52" y="52" width="216" height="14" rx="7" fill={soft} />
          <rect x="52" y="82" width="150" height="14" rx="7" fill={soft} />
          <rect x="52" y="82" width="66" height="14" rx="7" fill={stroke} />
          <rect x="52" y="112" width="188" height="14" rx="7" fill={soft} />
          <rect x="52" y="142" width="96" height="14" rx="7" fill={soft} />
        </g>
      );

    // One idea, many languages: a globe with speech marks.
    case "multi-language":
      return (
        <g>
          <circle cx="150" cy="90" r="54" fill="none" stroke={stroke} strokeWidth="7" />
          <ellipse cx="150" cy="90" rx="24" ry="54" fill="none" stroke={soft} strokeWidth="5" />
          <path d="M96 90 H204 M106 62 H194 M106 118 H194" stroke={soft} strokeWidth="5" strokeLinecap="round" />
          <rect x="196" y="112" width="70" height="46" rx="14" fill={stroke} />
          <path d="M212 158 L212 172 L228 158 Z" fill={stroke} />
        </g>
      );

    // Automatic detection: a waveform with the chosen moment bracketed.
    case "product":
      return (
        <g>
          {[26, 52, 34, 76, 108, 82, 44, 62, 30].map((h, i) => (
            <rect key={i} x={44 + i * 28} y={90 - h / 2} width="12" height={h} rx="6" fill={soft} />
          ))}
          <rect x="120" y="24" width="92" height="132" rx="16" fill="none" stroke={stroke} strokeWidth="6" />
          <circle cx="166" cy="90" r="9" fill={stroke} />
        </g>
      );
  }
}

export default function PostCover({ category, label }: { category: BlogCategorySlug; label: string }) {
  const palette = PALETTES[category];
  const gradientId = `cover-${category}`;

  return (
    <svg
      viewBox="0 0 320 180"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      // The card's heading already names the post; announcing the decorative
      // artwork again would just be noise in a screen reader's list of links.
      aria-label={`${label} article`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.from} />
          <stop offset="100%" stopColor={palette.to} />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill={`url(#${gradientId})`} />
      <Motif category={category} />
    </svg>
  );
}
