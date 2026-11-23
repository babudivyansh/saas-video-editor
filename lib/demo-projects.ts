// Demo projects: finished AutoClip runs on the sample videos
// (lib/sample-projects.ts), shown read-only to every signed-in user — Home's
// "Start from a demo project" cards open one at /dashboard/demo/<slug>, with
// its clips already made, so a new user sees what AutoClip gives back before
// running it on anything.
//
// A demo is an ordinary Project (owned by whichever account ran it) whose
// demoSlug is set to the sample's id; scripts/set-demo-project.ts sets it.
// Nothing here writes: viewers can watch the clips, nothing else.

import { prisma } from "@/lib/prisma";
import { clipViewSelect, toClipView } from "@/lib/clip-view-query";
import { SAMPLE_VIDEOS, sampleVideo, type SampleId } from "@/lib/sample-projects";

export interface DemoCard {
  slug: SampleId;
  title: string;
  label: string;
  clipCount: number;
}

/** The demos that exist in this environment, in the samples' order. */
export async function listDemoProjects(): Promise<DemoCard[]> {
  const rows = await prisma.project.findMany({
    where: { demoSlug: { in: SAMPLE_VIDEOS.map((s) => s.id) }, status: "completed" },
    select: { demoSlug: true, _count: { select: { clips: { where: { status: "ready" } } } } },
  });
  return SAMPLE_VIDEOS.flatMap((s) => {
    const row = rows.find((r) => r.demoSlug === s.id);
    if (!row || row._count.clips === 0) return [];
    return [{ slug: s.id, title: s.title, label: s.label, clipCount: row._count.clips }];
  });
}

/** One demo's clips, in the shape GET /api/projects/[id]/clips returns. */
export async function demoProjectClips(slug: string, wantExcerpts: boolean) {
  const sample = sampleVideo(slug);
  if (!sample) return null;
  const project = await prisma.project.findUnique({
    where: { demoSlug: sample.id },
    select: { id: true, status: true, autoClipCaptionStyle: true, updatedAt: true, instructions: true },
  });
  if (!project || project.status !== "completed") return null;
  const rows = await prisma.clip.findMany({
    // Only finished clips: a demo never shows a render in progress or a failure.
    where: { projectId: project.id, status: "ready" },
    orderBy: [{ score: { sort: "desc", nulls: "last" } }, { index: "asc" }],
    select: clipViewSelect(wantExcerpts),
  });
  // toClipView signs the render URLs (server-written, so safe for any viewer).
  const clips = (await Promise.all(rows.map((row) => toClipView(row, wantExcerpts)))).map((c) => ({
    ...c,
    projectTitle: sample.title,
    // Per-viewer state doesn't apply to someone else's clips.
    isFavorite: false,
    isDisliked: false,
  }));
  return {
    project: {
      status: project.status,
      warnings: null,
      failureReason: null,
      captionStyleIndex: project.autoClipCaptionStyle,
      // The source isn't handed out: demos show clips, not the raw upload.
      uploadedVideoUrl: null,
      updatedAt: project.updatedAt,
      title: sample.title,
      instructions: project.instructions,
      progress: 100,
    },
    clips,
    demo: { slug: sample.id, title: sample.title, creator: sample.creator, sourceUrl: sample.sourceUrl },
  };
}
