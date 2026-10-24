import { NextResponse } from "next/server";
import { withApi } from "@/lib/api-handler";
import { getUserTier } from "@/lib/auth";
import { getActiveCaptionTemplates } from "@/lib/captions/templateRegistry";
import { CAPTION_FAMILIES, templateTierAllowed } from "@/lib/caption-templates";
import { getComplexShapingSupport } from "@/lib/render-runtime";
import { CAPTION_FONTS_DIR } from "@/lib/captions/engine";
import { ffmpegBin } from "@/utils/ffmpeg-render";

// The caption picker's data source: the shared template catalogue with admin
// renames applied, plus what this user may pick.
//
// `locked` follows the plan gate the server enforces on every save
// (templateTierAllowed); the picker shows locked templates with an upgrade
// prompt rather than hiding them. Hindi templates are left out entirely when
// the render runtime can't shape Devanagari.
export const GET = withApi(async (_req, { auth }) => {
  const [tier, devanagari] = await Promise.all([
    getUserTier(auth.userId),
    getComplexShapingSupport(ffmpegBin, CAPTION_FONTS_DIR),
  ]);
  const templates = await getActiveCaptionTemplates({ devanagari });

  return NextResponse.json({
    tier,
    families: CAPTION_FAMILIES,
    templates: templates.map((t) => ({ ...t, locked: !templateTierAllowed(t.tier, tier) })),
  });
});
