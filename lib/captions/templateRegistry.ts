// Server-side view of the caption template library.
//
// The templates themselves are code (packages/shared/src/captions/templates.ts),
// identical in the browser, the render workers and the mobile app. This adds
// the two things that need the server:
//
//  1. An admin overlay (Config key `caption_templates`) that can hide a
//     template or rename/re-describe it without a deploy. It cannot change how
//     a template renders; that would make the picker and the export disagree.
//  2. The Hindi family is only offered when the render runtime can shape
//     Devanagari (lib/render-runtime.ts probeComplexShaping), so nobody picks a
//     template the server would render with broken conjuncts.

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { CAPTION_TEMPLATES, type CaptionTemplateSpec } from "@clipiro/shared/caption-templates";

const CONFIG_KEY = "caption_templates";
const CACHE_KEY = "admin:caption_templates";
const CACHE_TTL = 60;

export interface CaptionTemplateOverride {
  hidden?: boolean;
  name?: string;
  hint?: string;
}

export type CaptionTemplateOverrides = Record<string, CaptionTemplateOverride>;

async function readOverrides(): Promise<CaptionTemplateOverrides> {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return JSON.parse(cached) as CaptionTemplateOverrides;
  } catch { /* fall through to the DB */ }

  try {
    const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } });
    const parsed = row ? (JSON.parse(row.value) as CaptionTemplateOverrides) : {};
    try {
      await redis.set(CACHE_KEY, JSON.stringify(parsed), "EX", CACHE_TTL);
    } catch { /* non-fatal */ }
    return parsed;
  } catch (err) {
    logger.warn("caption-templates", "override config unreadable; using code defaults");
    void err;
    return {};
  }
}

export async function invalidateTemplateCache(): Promise<void> {
  try { await redis.del(CACHE_KEY); } catch { /* non-fatal */ }
}

/**
 * The templates the picker offers, in catalogue order, with admin renames
 * applied and hidden ones removed. Devanagari templates are dropped when the
 * runtime can't shape them.
 */
export async function getActiveCaptionTemplates(opts: { devanagari: boolean }): Promise<CaptionTemplateSpec[]> {
  const overrides = await readOverrides();
  return CAPTION_TEMPLATES
    .filter((t) => !overrides[t.id]?.hidden)
    .filter((t) => opts.devanagari || t.script !== "devanagari")
    .map((t) => {
      const o = overrides[t.id];
      if (!o) return t;
      return {
        ...t,
        ...(typeof o.name === "string" && o.name.trim() ? { name: o.name.trim().slice(0, 40) } : {}),
        ...(typeof o.hint === "string" && o.hint.trim() ? { hint: o.hint.trim().slice(0, 240) } : {}),
      };
    });
}
