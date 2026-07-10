import Link from "next/link";
import { Button } from "@/app/components/ui/Button";

function IcChevron() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 18l6-6-6-6"/></svg>;
}

interface ToolCardProps {
  title: string;
  desc: string;
  href: string;
  /** Illustration slot rendered above the text block. */
  preview: React.ReactNode;
  /** Credit-cost pill (e.g. "1 credit") shown next to the title. */
  badge?: string;
  /** md = full-width CTA below the copy; sm = compact side pill. */
  size?: "sm" | "md";
  cta?: string;
}

export function ToolCard({ title, desc, href, preview, badge, size = "md", cta = "Try Now" }: ToolCardProps) {
  const shell = "rounded-[var(--radius-card)] border border-card-border overflow-hidden bg-white transition-all hover:shadow-card-hover hover:-translate-y-0.5 flex flex-col";

  if (size === "sm") {
    return (
      <div className={shell}>
        {preview}
        <div className="px-3 py-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-ink leading-tight">{title}</p>
            <p className="text-[11px] text-ink-soft mt-0.5 leading-relaxed">{desc}</p>
          </div>
          <Link href={href} className="flex-shrink-0 inline-flex items-center gap-0.5 border border-card-border hover:bg-tint-blue text-ink text-[11px] font-semibold px-2.5 py-1.5 rounded-full transition-colors whitespace-nowrap">
            {cta} <IcChevron />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      {preview}
      <div className="px-4 py-4 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          <h3 className="text-[15px] font-bold text-ink leading-tight">{title}</h3>
          {badge && (
            <span className="text-[10px] font-bold text-white grad-brand px-2 py-0.5 rounded-full flex-shrink-0">{badge}</span>
          )}
        </div>
        <p className="text-[13px] text-ink-soft leading-relaxed mb-4 flex-1">{desc}</p>
        <Button variant="secondary" size="md" href={href} className="w-full">
          {cta}
        </Button>
      </div>
    </div>
  );
}
