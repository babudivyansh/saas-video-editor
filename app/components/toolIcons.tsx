import type { ToolIcon as ToolIconName } from "@/app/components/featureLinks";

// The registry (featureLinks.ts) names each tool's glyph; this resolves the
// name to an SVG. Kept apart because proxy.ts imports the registry and must
// not pull React in.

const PATHS: Record<ToolIconName, React.ReactNode> = {
  scissors: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12" /></>,
  editor: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 15h18M8 15v5M14 15v5" /></>,
  crop: <path d="M6 2v14a2 2 0 002 2h14M18 22V8a2 2 0 00-2-2H2" />,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>,
  mic: <><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" /></>,
  face: <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  eraser: <><path d="M20 20H7L3 16l10-10 7 7-3.5 3.5" /><path d="M6.5 17.5l4-4" /></>,
  wave: <path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" />,
  music: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
  sparkle: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />,
  subs: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 12h4M13 12h4M7 15h10" /></>,
  bulb: <><path d="M9 18h6M10 22h4" /><path d="M12 2a7 7 0 00-4 12.7V16h8v-1.3A7 7 0 0012 2z" /></>,
  balance: <path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 006 0zM19 7l-3 7a3 3 0 006 0z" />,
  compress: <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />,
  note: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
  youtube: <><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M10 9l5 3-5 3z" /></>,
  instagram: <><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5h.01" /></>,
};

export function ToolIcon({ name, className = "w-[18px] h-[18px]" }: { name: ToolIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
