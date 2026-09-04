import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { announcementPatchSchema } from "@/lib/admin/schemas";

// PATCH — edit a draft's content, or publish it (`{ publish: true }`).
// Once published, content is immutable (delete and recreate instead) so the
// cron and an in-flight edit can never race on what actually gets mailed.
// Once sent, the row is frozen entirely — it's now a record of what went out.
export const PATCH = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;
  const body = await parseBody(req, announcementPatchSchema);

  const existing = await prisma.featureAnnouncement.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
  if (existing.sentAt) {
    return NextResponse.json({ error: "Already sent — it can no longer be edited." }, { status: 409 });
  }

  const { publish, ...contentPatch } = body;
  if (Object.keys(contentPatch).length > 0 && existing.publishedAt) {
    return NextResponse.json(
      { error: "Already published — delete this and create a new one to change its content." },
      { status: 409 },
    );
  }

  const data: {
    title?: string; body?: string; ctaLabel?: string | null; ctaUrl?: string | null;
    audience?: string; publishedAt?: Date;
  } = { ...contentPatch };
  if (publish && !existing.publishedAt) data.publishedAt = new Date();

  const announcement = await prisma.featureAnnouncement.update({ where: { id }, data });
  await auditAdminAction(
    admin.userId,
    publish ? "announcement.published" : "announcement.updated",
    id,
    { before: existing, after: announcement, ip: auditIp(req) },
  );
  return NextResponse.json({ announcement });
});

// DELETE — allowed any time before sentAt, including after publish (an
// escape hatch for "published by mistake" up until the cron actually runs).
export const DELETE = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;

  const existing = await prisma.featureAnnouncement.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
  if (existing.sentAt) {
    return NextResponse.json({ error: "Already sent — it can no longer be deleted." }, { status: 409 });
  }

  await prisma.featureAnnouncement.delete({ where: { id } });
  await auditAdminAction(admin.userId, "announcement.deleted", id, { before: existing, ip: auditIp(req) });
  return NextResponse.json({ status: "deleted" });
});
