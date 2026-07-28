"use client";

import { Button } from "@/app/components/ui/Button";
import { trackMarketingEvent } from "@/app/components/analytics/track";
import type { MarketingPlacement } from "@/lib/marketing-analytics";

interface BlogCtaProps {
  placement: MarketingPlacement;
  /** The article/listing path this CTA sits on — the dimension we report against. */
  path: string;
  heading?: string;
  body?: string;
  label?: string;
  href?: string;
  /** "lg" for the standalone listing block, "md" inline in an article. */
  size?: "md" | "lg";
}

/**
 * The blog's only conversion surface, and until now the only one with no
 * instrumentation at all — the link carried no tracking, so blog-to-trial
 * conversion could not be measured even in principle.
 *
 * A client component because the tracking needs an onClick; the surrounding
 * pages stay server components.
 */
export default function BlogCta({
  placement,
  path,
  heading = "Ready to put this into practice?",
  body = "Start turning your own long-form videos into clips with Clipiro.",
  label = "Get started free",
  href = "/pricing",
  size = "md",
}: BlogCtaProps) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border border-brand-soft bg-gradient-to-br from-brand/[0.04] to-accent-violet/[0.04] text-center ${
        size === "lg" ? "p-10" : "p-8"
      }`}
    >
      <p className={`font-extrabold text-ink ${size === "lg" ? "text-2xl" : "text-xl"}`}>{heading}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">{body}</p>
      <div className={size === "lg" ? "mt-6" : "mt-5"}>
        <Button href={href} size="lg" onClick={() => trackMarketingEvent("cta_click", { path, placement })}>
          {label}
        </Button>
      </div>
    </div>
  );
}
