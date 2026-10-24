import { z } from "zod";
import { isKnownTemplateId } from "@clipiro/shared/caption-templates";

// One schema for creating (POST /api/brand-kits) and editing
// (PATCH /api/brand-kits/[id]) a brand kit. PATCH used to copy fields raw, and
// these strings end up in the ASS subtitle file's Style line
// (utils/ffmpeg-render.ts generateASS): a newline or comma in a colour could
// inject extra caption events or shift every field after it.

// Same rule the clip re-render endpoint applies (lib/autoclip-rerender.ts).
export const assColor = z.string().regex(/^&H[0-9A-Fa-f]{2,8}$/, "expected an ASS colour like &H00FFFFFF");
// The character set generateASS accepts for a font family.
const fontName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9 -]{0,63}$/, "expected a font family name");

// Same field shape as Clip.subtitleStyleOverride — a brand kit is that object,
// saved once at the account level instead of per clip.
export const brandKitFields = z.object({
  fontName: fontName.nullable().optional(),
  fontSize: z.number().int().min(8).max(400).nullable().optional(),
  baseColor: assColor.nullable().optional(),
  highlightColor: assColor.nullable().optional(),
  outlineColor: assColor.nullable().optional(),
  shadowColor: assColor.nullable().optional(),
  outlineWidth: z.number().int().min(0).max(100).nullable().optional(),
  shadowDepth: z.number().int().min(0).max(100).nullable().optional(),
  borderStyle: z.number().int().min(0).max(4).nullable().optional(),
  alignment: z.number().int().min(1).max(9).nullable().optional(),
  animated: z.boolean().nullable().optional(),
  logoUrl: z.string().max(2048).nullable().optional(),
  // The kit's caption template (packages/shared/src/captions/templates.ts).
  // Retired ids are accepted; they resolve to their replacement when applied.
  captionTemplateId: z.string().max(64).refine(isKnownTemplateId, "unknown caption template").nullable().optional(),
});

export const brandKitCreateSchema = brandKitFields.extend({ name: z.string().trim().min(1).max(100) }).strict();

export const brandKitPatchSchema = brandKitFields
  .extend({ name: z.string().trim().min(1).max(100).optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
