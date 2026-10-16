import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAX_DOC_BYTES } from "@/lib/editor/types";
import { withRateLimit } from "@/lib/with-rate-limit";
import { snapshotDoc } from "@/lib/project-versions";

// Version history list for a manual-editor project (newest first). Docs are
// not returned — only what the list shows.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await prisma.project.findFirst({ where: { id, userId: auth.userId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const versions = await prisma.projectVersion.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    select: { id: true, version: true, reason: true, clipCount: true, durationSec: true, createdAt: true },
  });
  return NextResponse.json({ versions });
}

// Sets the browser's copy aside in history before the conflict banner's
// "Load the other version" replaces it, so that choice loses nothing either.
async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await prisma.project.findFirst({ where: { id, userId: auth.userId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { doc?: unknown; version?: unknown } | null;
  const doc = body?.doc as { version?: unknown; tracks?: unknown } | undefined;
  if (!doc || typeof doc !== "object" || doc.version !== 1 || typeof doc.tracks !== "object" || doc.tracks === null) {
    return NextResponse.json({ error: "Invalid editor document" }, { status: 400 });
  }
  if (JSON.stringify(doc).length > MAX_DOC_BYTES) {
    return NextResponse.json({ error: "Editor document too large" }, { status: 413 });
  }
  const version = typeof body?.version === "number" ? body.version : 0;
  const saved = await snapshotDoc(id, doc, version, "conflict");
  return NextResponse.json({ saved });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "projects:keep-version" });
