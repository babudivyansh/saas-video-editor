import { Card, type CardTint } from "@/app/components/ui/Card";
import type { CalloutTone } from "./types";

// Reuses the design system's existing tint vocabulary rather than inventing a
// parallel set of callout colors.
const TONE: Record<CalloutTone, { tint: CardTint; icon: string; label: string }> = {
  tip: { tint: "emerald", icon: "💡", label: "Tip" },
  warning: { tint: "amber", icon: "⚠️", label: "Watch out" },
  note: { tint: "blue", icon: "📌", label: "Note" },
  stat: { tint: "violet", icon: "📊", label: "By the numbers" },
};

export default function Callout({ tone, title, text }: { tone: CalloutTone; title?: string; text: string }) {
  const { tint, icon, label } = TONE[tone];

  return (
    <Card tint={tint} padding="md" className="my-8">
      <div className="flex gap-3">
        <span aria-hidden="true" className="text-lg leading-none">
          {icon}
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink-soft">{title ?? label}</p>
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink">{text}</p>
        </div>
      </div>
    </Card>
  );
}
