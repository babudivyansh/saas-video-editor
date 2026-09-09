import { NextResponse } from "next/server";
import { withApi } from "@/lib/api-handler";
import { getActiveCaptionTemplates } from "@/lib/captions/templateRegistry";
import { CAPTION_CATEGORIES } from "@/lib/caption-templates";
import { isProviderTemplate } from "@/lib/caption-templates";

// The caption picker's data source.
//
// Deliberately does NOT hit the provider on every request — the live template
// list is cached for 6h by lib/captions/templateSync.ts and consulted only to
// deactivate mappings that have rotted. Opening the picker must never cost a
// provider API call (§8).
//
// `providerTemplateId` is stripped: the routing key stays server-side, so a
// template can be re-pointed at a different provider without a client release.
// Some labels now happen to READ like the provider's own names (a deliberate
// product choice — see lib/caption-templates.ts), but that is a display string
// travelling under `label`, not the mapping leaking.
export const GET = withApi(async () => {
  const templates = await getActiveCaptionTemplates();

  return NextResponse.json({
    categories: CAPTION_CATEGORIES,
    templates: templates.map((t) => ({
      id: t.id,
      label: t.label,
      hint: t.hint,
      category: t.category ?? null,
      premium: t.premium ?? false,
      // Whether the template auto-places emoji. Sent so the picker can both
      // mark it and DRAW it — the preview runs the same planEmoji() the render
      // does, rather than a second, drifting idea of where emoji go.
      emoji: t.emoji ?? false,
      // False for the templates whose look nobody has authored — the picker
      // marks those rather than presenting a stand-in swatch as the real thing.
      lookVerified: t.lookVerified !== false,
      previewImageUrl: t.previewImageUrl ?? null,
      previewVideoUrl: t.previewVideoUrl ?? null,
      // Whether picking this costs credits — the UI needs this to show a price,
      // but not WHICH provider renders it.
      requiresRender: isProviderTemplate(t),
      // The native ASS style, so the browser can draw an instant local preview
      // without a provider round-trip (§27).
      style: t.style,
    })),
  });
});
