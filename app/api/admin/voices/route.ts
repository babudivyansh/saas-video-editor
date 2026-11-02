import { NextResponse } from "next/server";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { voiceOverrideSchema } from "@/lib/admin/schemas";
import { getVoiceLibrary, getVoiceOverrides, setVoiceOverride } from "@/lib/voices/registry";
import { getMissingLibraryVoices } from "@/lib/voices/library-sync";

// GET   — every catalogue voice (starter + Voice Library), with its override
//         and whether the nightly sync found it withdrawn.
// PATCH — show/hide or re-order one voice (the voice_catalog Config row). No
//         deploy; the picker reads it within a minute.
export const GET = withAdmin(async () => {
  const [all, overrides, missing] = await Promise.all([getVoiceLibrary(), getVoiceOverrides(), getMissingLibraryVoices()]);
  const voices = all
    .filter((v) => !v.aliasOf)
    .map((v) => ({
      slug: v.slug,
      label: v.label,
      description: v.description ?? null,
      category: v.category,
      gender: v.gender,
      accent: v.accent ?? null,
      languages: v.languages,
      useCase: v.useCase ?? null,
      previewUrl: v.previewUrl ?? null,
      active: v.active !== false,
      withdrawn: missing.has(v.slug),
      sortOrder: v.sortOrder ?? 0,
      override: overrides[v.slug] ?? null,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  return NextResponse.json({ voices });
});

export const PATCH = withAdmin(async (req, { admin }) => {
  const { slug, active, sortOrder, clear } = await parseBody(req, voiceOverrideSchema);

  const known = (await getVoiceLibrary()).some((v) => v.slug === slug);
  if (!known) return NextResponse.json({ error: "Unknown voice" }, { status: 404 });

  const before = (await getVoiceOverrides())[slug] ?? null;
  const map = await setVoiceOverride(
    slug,
    clear ? null : { ...(active !== undefined ? { active } : {}), ...(sortOrder !== undefined ? { sortOrder } : {}) },
  );

  await auditAdminAction(admin.userId, "voice.override_updated", slug, {
    before,
    after: map[slug] ?? null,
    ip: auditIp(req),
  });

  return NextResponse.json({ override: map[slug] ?? null });
});
