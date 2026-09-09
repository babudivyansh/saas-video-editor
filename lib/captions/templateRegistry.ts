// Server-side view of the caption template library.
//
// lib/caption-templates.ts is plain data with no server imports on purpose —
// app/components/auto-clip/CaptionTemplatePicker.tsx imports it directly in the
// browser. So the parts that need Postgres/Redis (the admin override layer and
// the live provider validation) live here instead of being bolted onto that
// file, which would drag prisma into a client bundle.
//
// Shape follows getGpuRouting()/getAutoClipPricing(): defaults in code, an
// optional Config row spread over them, cached briefly in Redis. That means a
// template can be added, re-pointed, re-priced, given preview media or hidden
// entirely from the admin UI with no deploy (§9's "add more templates later
// without code changes where possible").

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { CAPTION_TEMPLATES, type CaptionTemplate } from "@/lib/caption-templates";
import { getKnownProviderTemplates } from "./templateSync";

const CONFIG_KEY = "caption_templates";
const CACHE_KEY = "admin:caption_templates";
const CACHE_TTL = 60;

/**
 * Admin overrides, keyed by template id. A partial is spread over the code
 * default, so a row only has to carry what differs — and a field added to
 * CaptionTemplate later automatically appears on overridden templates too.
 *
 * An id with no code default is allowed: that's how a brand-new template gets
 * added without a deploy. It must then carry everything a template needs.
 */
export type CaptionTemplateOverrides = Record<string, Partial<CaptionTemplate>>;

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
 * The full library: code defaults + admin overrides, with provider mappings
 * that no longer resolve forced inactive.
 *
 * That last step is the safety valve from §8 — if a provider template vanishes,
 * the template stops being offered instead of failing at paid render time. When
 * the provider list can't be read at all we leave everything enabled, because a
 * provider outage emptying the picker would be a worse bug than the one we're
 * preventing.
 */
export async function getCaptionTemplateLibrary(): Promise<CaptionTemplate[]> {
  const overrides = await readOverrides();

  const byId = new Map<string, CaptionTemplate>();
  for (const t of CAPTION_TEMPLATES) byId.set(t.id, t);
  for (const [id, patch] of Object.entries(overrides)) {
    const base = byId.get(id);
    if (base) byId.set(id, { ...base, ...patch, id });
    else if (isCompleteTemplate(patch)) byId.set(id, { ...patch, id });
  }

  const all = [...byId.values()];
  const known = await getKnownProviderTemplates();
  if (!known) return all;

  return all.map((t) =>
    t.provider === "submagic" && t.providerTemplateId && !known.has(t.providerTemplateId)
      ? { ...t, active: false }
      : t,
  );
}

/** What the picker shows: active only, in sortOrder then label order. */
export async function getActiveCaptionTemplates(): Promise<CaptionTemplate[]> {
  const all = await getCaptionTemplateLibrary();
  return all
    .filter((t) => t.active !== false)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.label.localeCompare(b.label));
}

/** Resolves one template by id, honouring overrides. Null when unknown or disabled. */
export async function resolveCaptionTemplate(id: string): Promise<CaptionTemplate | null> {
  const all = await getCaptionTemplateLibrary();
  return all.find((t) => t.id === id && t.active !== false) ?? null;
}

function isCompleteTemplate(p: Partial<CaptionTemplate>): p is CaptionTemplate {
  return Boolean(p.label && p.hint && p.style);
}
