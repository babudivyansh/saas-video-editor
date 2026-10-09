import { IMAGE_MODEL_CATALOG, type Asset, type Job } from "@clipiro/shared";
import { ApiError, respond } from "./core";
import { addAiAsset } from "./assets";

// AI tool jobs (POST /jobs, GET /jobs/:id) as the server runs them: queued,
// running once, then done with the result saved in Assets — or failed and
// refunded under scenario "tools" = "error".

type Started = { type: string; body: Record<string, unknown>; polls: number; asset: Asset | null };
const started = new Map<string, Started>();
let seq = 0;
const VOICE_NAMES: Record<string, string> = { brian: "Brian", aria: "Aria" };

export function resetToolJobs() {
  started.clear();
  seq = 0;
}

export function startToolJob(body: Record<string, unknown>): string {
  const type = String(body.type);
  if (!["ai-image", "voiceover", "enhance-speech", "vocal-remover"].includes(type)) throw new ApiError("Unknown job type", 400);
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
