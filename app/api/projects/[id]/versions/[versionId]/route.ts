import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateDashboardSummary } from "@/lib/dashboard-summary-cache";
import { withRateLimit } from "@/lib/with-rate-limit";
import { snapshotDoc } from "@/lib/project-versions";

// Restores a snapshot as the project's editorDoc. Same optimistic-concurrency
// rule as the PATCH (the client sends the editorVersion it holds; a newer save
// elsewhere means 409), and the doc being replaced is kept in history first,
// so a restore can itself be undone from Version history.
async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, versionId } = await params;

  const body = await req.json().catch(() => ({}));
  const expectedVersion = (body as { expectedVersion?: unknown }).expectedVersion;
  if (typeof expectedVersion !== "number") {
    return NextResponse.json({ error: "expectedVersion required" }, { status: 400 });
  }

  const existing = await prisma.project.findFirst({ where: { id, userId: auth.userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const snapshot = await prisma.projectVersion.findFirst({ where: { id: versionId, projectId: id } });
  if (!snapshot) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  const claimed = await prisma.project.updateMany({
    where: { id, userId: auth.userId, editorVersion: expectedVersion },
    data: { editorDoc: snapshot.doc as object, editorVersion: { increment: 1 } },
  });
  if (claimed.count === 0) {
    const current = await prisma.project.findUnique({ where: { id }, select: { editorVersion: true } });
    return NextResponse.json({ error: "version_conflict", currentVersion: current?.editorVersion ?? null }, { status: 409 });
  }
  if (existing.editorVersion === expectedVersion) {
    await snapshotDoc(id, existing.editorDoc, existing.editorVersion, "restore");
  }

  const project = await prisma.project.findUnique({ where: { id } });
  await invalidateDashboardSummary(auth.userId);
  return NextResponse.json({ project });
}

export const POST = withRateLimit(handlePOST, { limit: 20, windowSec: 60, keyBy: "user", name: "projects:restore-version" });
