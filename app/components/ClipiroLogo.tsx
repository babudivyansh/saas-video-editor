// Brand mark: a play-button triangle with a diagonal "growth" arrow breaking
// through it (video → viral), paired with the wordmark. Replaces the old
// clipiro-wordmark.png so it scales crisply and follows this codebase's
// hand-rolled-SVG convention (no icon library anywhere else either).

export function ClipiroMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M27 21 L27 79 C27 83.2 31.7 85.7 35.2 83.4 L76 57.4 C79.2 55.3 79.2 50.7 76 48.6 L35.2 22.6 C31.7 20.3 27 22.8 27 27 Z"
        fill="none"
        stroke="#335CFF"
        strokeWidth="8.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M16 84 L62 40 M62 40 L44 40 M62 40 L62 58"
        stroke="#335CFF"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ClipiroLogo({ className = "h-9" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <ClipiroMark className="h-full w-auto" />
      <span className="text-2xl font-extrabold tracking-tight" style={{ color: "#335CFF" }}>
        Clipiro
      </span>
    </span>
  );
}
