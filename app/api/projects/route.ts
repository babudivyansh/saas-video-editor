import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projects = await prisma.project.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title } = body;
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const project = await prisma.project.create({
    data: {
      userId: auth.userId,
      title,
      script: body.script ?? "",
      voiceId: body.voiceId ?? "",
      musicUrl: body.musicUrl ?? null,
      backgroundUrl: body.backgroundUrl ?? "",
      subtitlesStyle: body.subtitlesStyle ?? {},
      status: "draft",
    },
  });
  return NextResponse.json({ project }, { status: 201 });
}
