import type { Job, JobType } from "@clipiro/shared";
import { prisma } from "@/lib/prisma";
import { resignMediaUrl } from "@/lib/signed-media";

// /api/mobile/v1/jobs/:id — every job read from the database, never from a
// route's in-memory Map, so the answer is right after a restart:
//   gen_<id>  an AI tool job's Generation row (status, progress, result)
//   run_<id>  an AutoClip run: its Project (and clip count)
//   exp_<id>  an editor export: its Project (and the rendered video)

const TOOL_TYPES: Record<string, JobType> = {
  "image-generator": "ai-image",
  voiceover: "voiceover",
  "enhance-speech": "enhance-speech",
  "vocal-remover": "vocal-remover",
};

export const jobIdFor = { generation: (id: string) => `gen_${id}`, run: (id: string) => `run_${id}`, export: (id: string) => `exp_${id}` };

function parseJobId(jobId: string): { kind: "gen" | "run" | "exp"; id: string } | null {
  const m = /^(gen|run|exp)_(.+)$/.exec(jobId);
  return m ? { kind: m[1] as "gen" | "run" | "exp", id: m[2]! } : null;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export async function readJob(userId: string, jobId: string): Promise<Job | null> {
  const ref = parseJobId(jobId);
  if (!ref) return null;

  if (ref.kind === "gen") {
    const g = await prisma.generation.findFirst({
      where: { id: ref.id, userId },
      select: { toolSlug: true, status: true, progress: true, errorMessage: true, createdAt: true, result: true, resultAssetId: true },
    });
    const type = g && TOOL_TYPES[g.toolSlug];
    if (!g || !type) return null;
    const done = g.status === "completed";
    const failed = g.status === "failed" || g.status === "refunded" || g.status === "cancelled";
    const result = (g.result ?? null) as { url?: string } | null;
    return {
      id: jobId,
      type,
      status: done ? "done" : failed ? "failed" : g.progress > 5 ? "running" : "queued",
      progress: done ? 100 : clamp(g.progress),
      error: failed ? (g.status === "cancelled" ? "Cancelled." : (g.errorMessage ?? "This didn't work. Your credits were refunded.")) : null,
      createdAt: g.createdAt.toISOString(),
      result: done ? { assetId: g.resultAssetId, url: await resignMediaUrl(result?.url ?? null), projectId: null, clipCount: null } : null,
    };
  }

  const p = await prisma.project.findFirst({
    where: { id: ref.id, userId, productType: ref.kind === "run" ? "auto-clip" : "editor" },
    select: { status: true, progress: true, failureReason: true, createdAt: true, updatedAt: true, videoUrl: true },
  });
  if (!p) return null;
  const done = p.status === "completed";
  const failed = p.status === "failed";
  const running = p.status === "analyzing" || p.status === "rendering";
  const clipCount = ref.kind === "run" && done ? await prisma.clip.count({ where: { projectId: ref.id, status: "ready" } }) : null;
  return {
    id: jobId,
    type: ref.kind === "run" ? "autoclip" : "export",
    status: done ? "done" : failed ? "failed" : running ? "running" : "queued",
    progress: done ? 100 : clamp(p.progress),
    error: failed ? (p.failureReason ?? "This didn't work. Anything you were charged has been refunded.") : null,
    createdAt: (ref.kind === "run" ? p.createdAt : p.updatedAt).toISOString(),
    result: done
      ? { assetId: null, url: ref.kind === "exp" ? await resignMediaUrl(p.videoUrl) : null, projectId: ref.id, clipCount }
      : null,
  };
}
