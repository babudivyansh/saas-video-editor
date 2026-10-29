import { NextResponse } from "next/server";
import { withApi } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { openEditor } from "@/lib/mobile/editor";
import { STUDIO_PRODUCT_TYPE } from "@/lib/captions/studio";
import { resolveTemplateId } from "@clipiro/shared/caption-templates";

// GET /api/captions/projects/:id — a Caption Studio project: its doc and save
// version (saves go through PATCH /api/projects/:id like the editor's), a
// playable link per file, and the template its captions start on.
export const GET = withApi<{ id: string }>(async (_req, { auth, params }) => {
  const open = await openEditor(auth.userId, params.id, STUDIO_PRODUCT_TYPE);
  if (!open) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const row = await prisma.project.findUnique({ where: { id: params.id }, select: { subtitlesStyle: true } });
  const style = (row?.subtitlesStyle ?? {}) as { templateId?: string; language?: string; removeFillers?: boolean };
  return NextResponse.json({
    ...open,
    startTemplateId: resolveTemplateId(style.templateId ?? null),
    language: style.language ?? null,
    removeFillers: style.removeFillers !== false,
  });
});
