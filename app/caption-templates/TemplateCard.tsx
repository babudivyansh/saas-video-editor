import { CAPTION_TIER_LABEL, type CaptionTemplateSpec } from "@clipiro/shared/caption-templates";
import { TemplatePreviewLoop } from "@/app/components/captions/CaptionTemplateGallery";

/**
 * One template on the public gallery: the live preview the in-app picker uses
 * (so what a visitor sees is what renders), plus its name, plan and the
 * one-line description — the text a search or answer engine can read.
 */
export default function TemplateCard({ template: t, detailed = false }: { template: CaptionTemplateSpec; detailed?: boolean }) {
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-card-border bg-panel">
      <div className="relative bg-surface-2">
        <TemplatePreviewLoop template={t} />
        <span
          className={`absolute left-2 top-2 rounded-full border px-2 py-px text-[10px] font-bold uppercase tracking-wide text-ink ${
            t.tier === "free"
              ? "border-card-border bg-panel"
              : t.tier === "pro"
                ? "border-tint-amber-border bg-tint-amber"
                : "border-tint-emerald-border bg-tint-emerald"
          }`}
        >
          {t.tier === "free" ? "Free" : CAPTION_TIER_LABEL[t.tier]}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="text-[15px] font-semibold tracking-tight text-ink">{t.name}</h3>
        <p className="text-[13px] leading-[1.55] text-ink-soft">{t.hint}</p>
        {detailed && <p className="text-[12px] leading-[1.5] text-ink-soft">Best for: {t.benchmark}</p>}
      </div>
    </li>
  );
}
