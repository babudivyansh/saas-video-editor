import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Same field shape as Clip.subtitleStyleOverride (app/dashboard/create/auto-clip/page.tsx's
// ClipEditorDrawer Style tab) — a brand kit is that same object, saved once
// at the account level instead of only per-clip.
interface BrandKitFields {
  fontName?: string | null;
  fontSize?: number | null;
  baseColor?: string | null;
  highlightColor?: string | null;
  outlineColor?: string | null;
  shadowColor?: string | null;
  outlineWidth?: number | null;
  shadowDepth?: number | null;
  borderStyle?: number | null;
  alignment?: number | null;
  animated?: boolean | null;
  logoUrl?: string | null;
}

const FIELD_KEYS: (keyof BrandKitFields)[] = [
  "fontName", "fontSize", "baseColor", "highlightColor", "outlineColor", "shadowColor",
  "outlineWidth", "shadowDepth", "borderStyle", "alignment", "animated", "logoUrl",
];

function pickFields(body: Record<string, unknown>): BrandKitFields {
  const out: BrandKitFields = {};
  for (const key of FIELD_KEYS) {
    if (key in body) (out as Record<string, unknown>)[key] = body[key];
  }
  return out;
}

// GET — list this user's brand kits.
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const kits = await prisma.brandKit.findMany({
    where: { userId: auth.userId },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ kits });
}

// POST — save the current style as a new named brand kit.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  if (!name) return NextResponse.json({ error: "A name is required" }, { status: 400 });

  const kit = await prisma.brandKit.create({
    data: { userId: auth.userId, name, ...pickFields(body) },
  });
  return NextResponse.json({ kit }, { status: 201 });
}
