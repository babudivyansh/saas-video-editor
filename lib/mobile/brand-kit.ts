import { BRAND_KIT_DEFAULTS, type BrandKit, type BrandKitPatch } from "@clipiro/shared";
import type { BrandKit as BrandKitRow, Prisma } from "@prisma/client";
import { assToHex, hexToASS } from "@/lib/ass-color";
import { prisma } from "@/lib/prisma";
import { resignOwnedMediaUrl } from "@/lib/source-url";
import { s3KeyToPublicUrl } from "@/utils/s3-upload";

// The app's Brand Kit (mobile Phase 12.1) on the web's BrandKit rows. The web
// lets a person keep several; the app shows and edits the most recent one,
// and makes one on the first save. Colours are stored the web's way (ASS
// "&H00BBGGRR", lib/ass-color.ts) and handed to the app as #rrggbb.

export class BrandKitError extends Error {
  constructor(public status: number, message: string, public code: string) {
    super(message);
  }
}

const COLORS = ["baseColor", "highlightColor", "outlineColor", "shadowColor"] as const;

const latest = (userId: string) => prisma.brandKit.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });

function hexOf(stored: string | null, fallback: string): string {
  if (!stored) return fallback;
  if (/^#[0-9a-f]{6}$/i.test(stored)) return stored.toLowerCase();
  try {
    const h = assToHex(stored);
    return /^#[0-9a-f]{6}$/i.test(h) ? h.toLowerCase() : fallback;
  } catch {
    return fallback;
  }
}

export async function toBrandKit(row: BrandKitRow): Promise<BrandKit> {
  const d = BRAND_KIT_DEFAULTS;
  return {
    id: row.id,
    name: row.name,
    // Client-settable on the web (PATCH /api/brand-kits/[id]), so ownership-gated.
    logoUrl: await resignOwnedMediaUrl(row.logoUrl, row.userId),
    fontName: row.fontName ?? d.fontName,
    fontSize: Math.min(200, Math.max(8, row.fontSize ?? d.fontSize)),
    baseColor: hexOf(row.baseColor, d.baseColor),
    highlightColor: hexOf(row.highlightColor, d.highlightColor),
    outlineColor: hexOf(row.outlineColor, d.outlineColor),
    shadowColor: hexOf(row.shadowColor, d.shadowColor),
    captionTemplateId: row.captionTemplateId,
  };
}

export async function getBrandKit(userId: string): Promise<BrandKit | null> {
  const row = await latest(userId);
  return row ? toBrandKit(row) : null;
}

/** A logo must be one of the person's own, ready images in Assets. */
async function logoUrlFor(userId: string, assetId: string): Promise<string> {
  const asset = await prisma.asset.findFirst({ where: { id: assetId, userId }, select: { kind: true, status: true, s3Key: true } });
  if (!asset) throw new BrandKitError(404, "That image isn’t in your Assets any more.", "not_found");
  if (asset.kind !== "image") throw new BrandKitError(400, "A logo has to be an image.", "wrong_kind");
  if (asset.status !== "ready") throw new BrandKitError(409, "That image is still being processed.", "not_ready");
  return s3KeyToPublicUrl(asset.s3Key);
}

/** Saves changes to the latest kit, or makes the first one. */
export async function saveBrandKit(userId: string, patch: BrandKitPatch): Promise<BrandKit> {
  const data: Prisma.BrandKitUncheckedUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.fontName !== undefined) data.fontName = patch.fontName;
  if (patch.fontSize !== undefined) data.fontSize = patch.fontSize;
  for (const k of COLORS) if (patch[k] !== undefined) data[k] = hexToASS(patch[k]!);
  if (patch.captionTemplateId !== undefined) data.captionTemplateId = patch.captionTemplateId;
  if (patch.logoAssetId !== undefined) data.logoUrl = patch.logoAssetId === null ? null : await logoUrlFor(userId, patch.logoAssetId);

  const current = await latest(userId);
  if (current) return toBrandKit(await prisma.brandKit.update({ where: { id: current.id }, data }));

  const d = BRAND_KIT_DEFAULTS;
  return toBrandKit(
    await prisma.brandKit.create({
      data: {
        userId,
        name: patch.name ?? d.name,
        fontName: patch.fontName ?? d.fontName,
        fontSize: patch.fontSize ?? d.fontSize,
        baseColor: hexToASS(patch.baseColor ?? d.baseColor),
        highlightColor: hexToASS(patch.highlightColor ?? d.highlightColor),
        outlineColor: hexToASS(patch.outlineColor ?? d.outlineColor),
        shadowColor: hexToASS(patch.shadowColor ?? d.shadowColor),
        captionTemplateId: patch.captionTemplateId ?? null,
        logoUrl: (data.logoUrl as string | null | undefined) ?? null,
      },
    }),
  );
}
