import { IMAGE_MODEL_CATALOG, type Asset, type Job } from "@clipiro/shared";
import { ApiError, respond, scenarioOf } from "./core";
import { addAiAsset } from "./assets";

// AI tool jobs (POST /jobs, GET /jobs/:id) as the server runs them: queued,
// running once, then done with the result saved in Assets — or failed and
// refunded under scenario "tools" = "error".

type Started = { type: string; body: Record<string, unknown>; polls: number; asset: Asset | null };
const started = new Map<string, Started>();
let seq = 0;
const VOICE_NAMES: Record<string, string> = { brian: "Brian", aria: "Aria" };
/** The plan the mock account is on (scenario "account" = "empty" is a Free account). */
const planOf = () => (scenarioOf("account") === "empty" ? "free" : "studio");

export function resetToolJobs() {
  started.clear();
  seq = 0;
}

export function startToolJob(body: Record<string, unknown>): string {
  const type = String(body.type);
  if (!["ai-image", "voiceover", "enhance-speech", "vocal-remover", "voice-changer", "background-remover", "face-swap", "subtitle-remover"].includes(type)) throw new ApiError("Unknown job type", 400);
  if ((type === "face-swap" || type === "subtitle-remover") && planOf() === "free") {
    throw Object.assign(new ApiError(`${type === "face-swap" ? "Face Swap" : "Subtitle Remover"} requires the pro plan or higher.`, 403), { code: "plan_required" });
  }
  const id = `job_${type}_${++seq}`;
  started.set(id, { type, body, polls: 0, asset: null });
  return id;
}

function result(j: Started, n: string): Asset {
  if (j.type === "ai-image") {
    const model = IMAGE_MODEL_CATALOG.find((m) => m.id === j.body.modelId);
    return addAiAsset({ id: `img_${n}`, name: String(j.body.prompt).slice(0, 60), kind: "image", source: "image-generator", madeWith: model?.name ?? null, thumbnailUrl: "asset:travel-summit", url: `https://cdn.test/img_${n}.png` });
  }
  if (j.type === "voiceover") {
    const voice = VOICE_NAMES[String(j.body.voiceId)] ?? "Brian";
    return addAiAsset({ id: `vo_${n}`, name: `Voiceover · ${voice}`, kind: "audio", source: "voiceover", madeWith: voice, durationSec: 6, url: `https://cdn.test/vo_${n}.mp3` });
  }
  if (j.type === "voice-changer") {
    const voice = VOICE_NAMES[String(j.body.voiceId)] ?? "Brian";
    return addAiAsset({ id: `vc_${n}`, name: `voice-changed-${n}.mp3`, kind: "audio", source: "voice-changer", madeWith: voice, durationSec: 12, url: `https://cdn.test/vc_${n}.mp3` });
  }
  if (j.type === "background-remover") return addAiAsset({ id: `bg_${n}`, name: `photo-no-bg-${n}.png`, kind: "image", source: "background-remover", thumbnailUrl: "asset:founder-portrait", url: `https://cdn.test/bg_${n}.png` });
  if (j.type === "face-swap") return addAiAsset({ id: `fs_${n}`, name: `face-swap-${n}.jpg`, kind: "image", source: "face-swap", thumbnailUrl: "asset:creator-smile", url: `https://cdn.test/fs_${n}.jpg` });
  if (j.type === "subtitle-remover") return addAiAsset({ id: `sr_${n}`, name: `subtitle-removed-${n}.mp4`, kind: "video", source: "subtitle-remover", durationSec: 41, thumbnailUrl: "asset:keynote-stage", url: `https://cdn.test/sr_${n}.mp4` });
  return addAiAsset({ id: `au_${n}`, name: "Processed audio", kind: "audio", source: j.type as Asset["source"], durationSec: 30, url: `https://cdn.test/au_${n}.mp3` });
}

export async function toolJob(id: string): Promise<Job> {
  const j = started.get(id);
  if (!j) throw new ApiError("Job not found", 404);
  const s = await respond("tools").catch(() => "error" as const);
  j.polls++;
  const base = { id, type: j.type as Job["type"], stage: null, createdAt: "2026-10-10T09:00:00.000Z" };
  if (j.polls < 2) return { ...base, status: "running", progress: 50, error: null, result: null };
  if (s === "error") return { ...base, status: "failed", progress: 50, error: "The model didn’t return an image. Your credits were refunded.", result: null };
  j.asset ??= result(j, id.split("_").at(-1)!);
  return { ...base, status: "done", progress: 100, error: null, result: { assetId: j.asset.id, url: j.asset.url ?? null, projectId: null, clipCount: null } };
}

/** POST /tools/enhance-prompt */
export async function enhancePrompt(prompt: string): Promise<string> {
  await respond("enhance");
  return `${prompt.trim()}, golden hour light, shallow depth of field, rich colour`;
}

/** The last tool job started (tests check what the app sent). */
export const lastToolJob = () => [...started.values()].at(-1)?.body ?? null;
