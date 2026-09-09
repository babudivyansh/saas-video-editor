// Keeps Clipiro's provider-template mapping honest against the live provider.
//
// The failure this exists to prevent: a template name we map to is renamed or
// retired on the provider's side, and we only find out when a user's paid
// export fails with a validation error — after the credits were spent and after
// they waited. Instead the live list is fetched on a slow cadence, cached, and
// any mapping that no longer resolves is treated as inactive so the template
// simply stops being offered.
//
// Cached rather than fetched per request because the picker opens constantly
// and the list changes roughly never (§8). TTL is 6h; a miss degrades to
// "assume every mapping is fine", which is the right failure — a provider
// outage must not empty the template picker.

import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { listTemplates, listLanguages, isSubmagicConfigured } from "./providers/submagic/SubmagicClient";

const TEMPLATES_KEY = "submagic:templates";
const LANGUAGES_KEY = "submagic:languages";
const TTL_SEC = 6 * 60 * 60;

interface CachedList {
  values: string[];
  at: number;
}

async function readCache(key: string): Promise<string[] | null> {
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedList;
    return Array.isArray(parsed.values) ? parsed.values : null;
  } catch {
    return null;
  }
}

async function writeCache(key: string, values: string[]): Promise<void> {
  try {
    await redis.set(key, JSON.stringify({ values, at: Date.now() } satisfies CachedList), "EX", TTL_SEC);
  } catch { /* non-fatal — we just refetch sooner */ }
}

/**
 * Provider template names we believe exist.
 *
 * Returns null when we genuinely don't know (not configured, cache miss and the
 * fetch failed). Callers MUST treat null as "can't validate" and leave mappings
 * enabled — never as "nothing exists".
 */
export async function getKnownProviderTemplates(opts?: { refresh?: boolean }): Promise<Set<string> | null> {
  if (!isSubmagicConfigured()) return null;

  if (!opts?.refresh) {
    const cached = await readCache(TEMPLATES_KEY);
    if (cached) return new Set(cached);
  }

  try {
    const names = await listTemplates();
    if (names.length === 0) return null; // an empty list is far likelier to be a bad response than a real state
    await writeCache(TEMPLATES_KEY, names);
    return new Set(names);
  } catch (err) {
    logger.warn("submagic", "template list unavailable; leaving mappings enabled");
    void err;
    return null;
  }
}

/** Provider language codes. Same null semantics as above. */
export async function getKnownProviderLanguages(opts?: { refresh?: boolean }): Promise<Set<string> | null> {
  if (!isSubmagicConfigured()) return null;

  if (!opts?.refresh) {
    const cached = await readCache(LANGUAGES_KEY);
    if (cached) return new Set(cached);
  }

  try {
    const langs = await listLanguages();
    const codes = langs.map((l) => l.code).filter(Boolean);
    if (codes.length === 0) return null;
    await writeCache(LANGUAGES_KEY, codes);
    return new Set(codes);
  } catch {
    return null;
  }
}

export interface MappingValidationResult {
  ok: boolean;
  /** Clipiro template ids whose provider template no longer exists. */
  missing: { templateId: string; providerTemplateId: string }[];
  checked: number;
  /** True when the provider list couldn't be read, so nothing was actually verified. */
  skipped: boolean;
}

/**
 * Validates every configured mapping. Called by the sweep cron and exposed to
 * admin ops; a non-empty `missing` is a CONFIGURATION error on our side, so it
 * is logged at error level — the affected templates deactivate themselves via
 * getCaptionTemplates(), but somebody still needs to remap them.
 */
export async function validateTemplateMappings(
  templates: { id: string; provider?: string; providerTemplateId?: string }[],
): Promise<MappingValidationResult> {
  const known = await getKnownProviderTemplates();
  const mapped = templates.filter((t) => t.provider === "submagic" && t.providerTemplateId);

  if (!known) return { ok: true, missing: [], checked: mapped.length, skipped: true };

  const missing = mapped
    .filter((t) => !known.has(t.providerTemplateId as string))
    .map((t) => ({ templateId: t.id, providerTemplateId: t.providerTemplateId as string }));

  if (missing.length > 0) {
    logger.error(
      "submagic",
      `${missing.length} caption template mapping(s) no longer resolve and have been disabled: ` +
        missing.map((m) => `${m.templateId} -> "${m.providerTemplateId}"`).join(", "),
    );
  }

  return { ok: missing.length === 0, missing, checked: mapped.length, skipped: false };
}
