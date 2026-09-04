import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { announcementCreateSchema } from "@/lib/admin/schemas";

// FeatureAnnouncement — admin-authored broadcasts gating the featureReleases/
// newsletter NotificationPreference toggles (see schema.prisma's comment on
// the model). Created as a draft here; publishing and sending are separate
// steps — see [id]/route.ts's PATCH and app/api/cron/feature-announcements.
export const GET = withAdmin(async () => {
  const announcements = await prisma.featureAnnouncement.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ announcements });
});

export const POST = withAdmin(async (req, { admin }) => {
  const body = await parseBody(req, announcementCreateSchema);

  const announcement = await prisma.featureAnnouncement.create({
    data: {
      title: body.title,
      body: body.body,
      ctaLabel: body.ctaLabel ?? null,
      ctaUrl: body.ctaUrl ?? null,
      audience: body.audience,
      createdByAdminId: admin.userId,
    },
  });

  await auditAdminAction(admin.userId, "announcement.created", announcement.id, { after: announcement, ip: auditIp(req) });
  return NextResponse.json({ announcement }, { status: 201 });
});
