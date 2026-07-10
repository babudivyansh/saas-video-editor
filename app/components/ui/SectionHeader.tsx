import Link from "next/link";

function IcChevron() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 18l6-6-6-6"/></svg>;
}

interface SectionHeaderProps {
  title: string;
  action?: { label: string; href: string };
  className?: string;
}

export function SectionHeader({ title, action, className = "" }: SectionHeaderProps) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <h2 className="text-base font-extrabold text-ink">{title}</h2>
      {action && (
        <Link href={action.href} className="text-sm font-semibold text-brand hover:text-brand-dark flex items-center gap-1 transition-colors">
          {action.label} <IcChevron />
        </Link>
      )}
    </div>
  );
}
