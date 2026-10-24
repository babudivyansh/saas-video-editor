"use client";

import { useEffect, useState } from "react";
import {
  CAPTION_FAMILIES,
  CAPTION_TEMPLATES,
  type CaptionFamily,
  type CaptionTemplateSpec,
} from "@clipiro/shared/caption-templates";
import { clientAuthToken } from "@/lib/client-session";

export type PickerTemplate = CaptionTemplateSpec & { locked: boolean };

export interface CaptionTemplateList {
  templates: PickerTemplate[];
  families: readonly CaptionFamily[];
  /** The user's plan tier, once the server has answered. */
  tier: string | null;
}

// Until the server answers, show the built-in catalogue unlocked: the server
// enforces the plan gate on save either way, and an empty picker on a slow
// network would be worse than a lock that appears a moment later.
const FALLBACK: CaptionTemplateList = {
  templates: CAPTION_TEMPLATES.map((t) => ({ ...t, locked: false })),
  families: CAPTION_FAMILIES,
  tier: null,
};

let cache: CaptionTemplateList | null = null;
let inflight: Promise<CaptionTemplateList | null> | null = null;

function load(): Promise<CaptionTemplateList | null> {
  if (!inflight) {
    const token = clientAuthToken();
    inflight = fetch("/api/caption-templates", { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!Array.isArray(d?.templates) || d.templates.length === 0) return null;
        cache = { templates: d.templates, families: d.families ?? CAPTION_FAMILIES, tier: d.tier ?? null };
        return cache;
      })
      .catch(() => null)
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** The picker's template list (shared across every picker on the page). */
export function useCaptionTemplates(): CaptionTemplateList {
  const [list, setList] = useState<CaptionTemplateList>(cache ?? FALLBACK);
  useEffect(() => {
    if (cache) return;
    let live = true;
    void load().then((l) => { if (live && l) setList(l); });
    return () => { live = false; };
  }, []);
  return list;
}

/** Test seam. */
export function resetCaptionTemplateCache(): void {
  cache = null;
  inflight = null;
}
