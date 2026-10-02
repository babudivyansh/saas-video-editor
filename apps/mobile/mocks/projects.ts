import { projectDetailSchema, projectSummarySchema, type Clip, type ClipAspect, type ProjectDetail, type ProjectSummary } from "@clipiro/shared";
import { z } from "zod";
import { ApiError, respond, wait } from "./core";

// Stand-in for /api/mobile/v1/projects and /clips until Phase 5.
// Scenarios (core.ts): "projects", "project", "clips".

const ago = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();

let PROJECTS: ProjectSummary[] = [
  { id: "founders-pod-ep-42", title: "Founders Pod · Ep. 42", kind: "autoclip", status: "completed", aspect: "16:9", thumbnailUrl: "asset:podcast-mic", clipCount: 12, durationSec: 3492, updatedAt: ago(2) },
  { id: "leg-day-vlog", title: "Leg day vlog", kind: "editor", status: "draft", aspect: "9:16", thumbnailUrl: "asset:gym-lift", clipCount: 1, durationSec: 52, updatedAt: ago(26), draftSteps: ["media", "trim", "captions"] },
  { id: "summit-sunrise", title: "Summit sunrise", kind: "autoclip", status: "completed", aspect: "9:16", thumbnailUrl: "asset:travel-summit", clipCount: 6, durationSec: 545, updatedAt: ago(24 * 6) },
  { id: "dj-set", title: "DJ set highlights", kind: "autoclip", status: "rendering", aspect: "9:16", thumbnailUrl: "asset:dj-neon", clipCount: 8, durationSec: 1820, updatedAt: ago(24 * 7) },
  { id: "ignored-investors", title: "Why we ignored investors", kind: "editor", status: "completed", aspect: "9:16", thumbnailUrl: "asset:creator-golden", clipCount: 1, durationSec: 58, updatedAt: ago(24 * 10) },
  { id: "guest-intro", title: "Guest intro", kind: "editor", status: "draft", aspect: "1:1", thumbnailUrl: "asset:founder-portrait", clipCount: 1, durationSec: 34, updatedAt: ago(24 * 12), draftSteps: ["media", "trim"] },
  { id: "hiring-10", title: "Hiring your first 10", kind: "editor", status: "draft", aspect: "9:16", thumbnailUrl: "asset:creator-hat", clipCount: 1, durationSec: 47, updatedAt: ago(24 * 14), draftSteps: ["media", "trim", "captions", "audio"] },
  { id: "launch-teaser", title: "Launch teaser", kind: "editor", status: "draft", aspect: "16:9", thumbnailUrl: "asset:clapper", clipCount: 1, durationSec: 30, updatedAt: ago(24 * 20), draftSteps: ["media"] },
  { id: "keynote", title: "Keynote rehearsal", kind: "autoclip", status: "completed", aspect: "16:9", thumbnailUrl: "asset:keynote-stage", clipCount: 9, durationSec: 2520, updatedAt: ago(24 * 22) },
  { id: "studio-qa", title: "Studio Q&A", kind: "autoclip", status: "failed", aspect: "9:16", thumbnailUrl: "asset:studio-mic", clipCount: 0, durationSec: 1860, updatedAt: ago(24 * 24) },
  { id: "street-walk", title: "Street walk", kind: "editor", status: "completed", aspect: "9:16", thumbnailUrl: "asset:creator-denim", clipCount: 1, durationSec: 29, updatedAt: ago(24 * 26) },
  { id: "interview-maya", title: "Interview · Maya", kind: "autoclip", status: "completed", aspect: "16:9", thumbnailUrl: "asset:creator-violet", clipCount: 7, durationSec: 1560, updatedAt: ago(24 * 28) },
  { id: "bts", title: "Behind the scenes", kind: "editor", status: "completed", aspect: "1:1", thumbnailUrl: "asset:clapper", clipCount: 1, durationSec: 41, updatedAt: ago(24 * 30) },
  { id: "morning-routine", title: "Morning routine", kind: "autoclip", status: "processing", aspect: "9:16", thumbnailUrl: "asset:creator-smile", clipCount: 0, durationSec: 780, updatedAt: ago(1) },
];

const FOUNDERS_CLIPS: Clip[] = [
  ["Nobody tells you this part", 92, 41, "creator-smile", "ready"],
  ["We almost shut down twice", 88, 28, "founder-portrait", "ready"],
  ["The exact cold-email script", 81, 35, "creator-violet", "ready"],
  ["Hiring your first 10", 74, 44, "creator-hat", "rendering"],
  ["Why we ignored investors", 69, 44, "creator-golden", "ready"],
  ["The pricing mistake", 61, 33, "creator-denim", "failed"],
  ["Our first 100 users", 86, 38, "gym-lift", "ready"],
  ["What I'd do differently", 79, 52, "travel-summit", "ready"],
  ["The hardest week", 72, 29, "clapper", "ready"],
  ["Firing a friend", 66, 47, "studio-mic", "ready"],
  ["One metric that matters", 58, 31, "keynote-stage", "ready"],
  ["Ship before you're ready", 84, 26, "dj-neon", "ready"],
].map(([title, score, dur, photo, status], i) => ({
  id: `clp_${i + 1}`,
  projectId: "founders-pod-ep-42",
  rank: i + 1,
  title: title as string,
  score: score as number,
  durationSec: dur as number,
  aspect: "9:16" as ClipAspect,
  status: status as Clip["status"],
  thumbnailUrl: `asset:${photo}`,
  favorite: i === 1,
  failureReason: status === "failed" ? "The render ran out of time. Retrying usually fixes it." : null,
}));

const OTHER_CLIPS: Clip[] = [
  ["Above the clouds", 77, 22, "travel-summit", "9:16", "summit-sunrise"],
  ["Drop at 2am", 71, 18, "dj-neon", "9:16", "dj-set"],
  ["Stage fright fix", 83, 54, "keynote-stage", "16:9", "keynote"],
  ["The one question", 75, 61, "creator-violet", "16:9", "interview-maya"],
  ["Behind the take", 64, 41, "clapper", "1:1", "bts"],
  ["Guest intro", 70, 34, "founder-portrait", "1:1", "guest-intro"],
].map(([title, score, dur, photo, aspect, projectId], i) => ({
  id: `clp_o${i + 1}`,
  projectId: projectId as string,
  rank: 1,
  title: title as string,
  score: score as number,
  durationSec: dur as number,
  aspect: aspect as ClipAspect,
  status: "ready" as const,
  thumbnailUrl: `asset:${photo}`,
  favorite: false,
  failureReason: null,
}));

let CLIPS: Clip[] = [...FOUNDERS_CLIPS, ...OTHER_CLIPS];

const INITIAL = { projects: PROJECTS, clips: CLIPS };
/** Tests: undo every rename / delete / favourite. */
export function resetProjectMocks() {
  PROJECTS = INITIAL.projects;
  CLIPS = INITIAL.clips;
}

export async function getProjects(): Promise<ProjectSummary[]> {
  const s = await respond("projects");
  return z.array(projectSummarySchema).parse(s === "empty" ? [] : PROJECTS);
}

export async function getProject(id: string): Promise<ProjectDetail> {
  await respond("project");
  const p = PROJECTS.find((x) => x.id === id);
  if (!p) throw new ApiError("This project was deleted.", 404);
  return projectDetailSchema.parse({ ...p, clips: CLIPS.filter((c) => c.projectId === id) });
}

/** Every clip, optionally one shape (the Shorts & Reels / Videos / Square views). */
export async function getClips(aspect?: ClipAspect): Promise<Clip[]> {
  const s = await respond("clips");
  if (s === "empty") return [];
  return CLIPS.filter((c) => !aspect || c.aspect === aspect);
}

export async function setClipFavorite(id: string, favorite: boolean) {
  await wait();
  CLIPS = CLIPS.map((c) => (c.id === id ? { ...c, favorite } : c));
}

export async function deleteClips(ids: string[]) {
  await wait();
  CLIPS = CLIPS.filter((c) => !ids.includes(c.id));
}

export async function retryClip(id: string) {
  await wait();
  CLIPS = CLIPS.map((c) => (c.id === id ? { ...c, status: "rendering" as const, failureReason: null } : c));
}

export async function deleteProjects(ids: string[]) {
  await wait();
  PROJECTS = PROJECTS.filter((p) => !ids.includes(p.id));
  CLIPS = CLIPS.filter((c) => !ids.includes(c.projectId));
}

export async function renameProject(id: string, title: string) {
  const t = title.trim();
  if (!t) throw new ApiError("Give the project a name.", 400, "title");
  await wait();
  PROJECTS = PROJECTS.map((p) => (p.id === id ? { ...p, title: t.slice(0, 120) } : p));
}
