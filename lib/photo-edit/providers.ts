import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { FETCH_TIMEOUT } from "@/lib/fetch-timeout";
import { UserFacingError } from "@/lib/user-facing-error";
import { falSubmit, falPollUntilDone, falCancel, type FalRequest } from "@/lib/fal";
import { POLICY_MESSAGES } from "@/lib/photo-edit/policy";

// The two ways an edit reaches a model: Google's API directly for Gemini
// Flash Image (the key we already use for the generator), and fal's queue for
// everything else.

const GEMINI_IMAGE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";

const NO_IMAGE = "The model didn't return an image for this instruction. Try describing the change differently.";

interface GeminiResponse {
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string; content?: { parts?: { inlineData?: { data: string; mimeType: string }; text?: string }[] } }[];
}

/** One Gemini edit: the images (photo first, then references) and the instruction. Returns the edited image bytes. */
export async function geminiEdit(
  images: { buffer: Buffer; mimeType: string }[],
  prompt: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  const body = JSON.stringify({
    contents: [{
      parts: [
        ...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.buffer.toString("base64") } })),
        { text: prompt },
      ],
    }],
    generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
  });

  // gemini-2.5-flash-image answers 503 "high demand" now and then: a short
  // backoff usually clears it (same policy as the generator).
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const timeout = AbortSignal.timeout(120_000);
    res = await fetch(GEMINI_IMAGE_URL, {
      method: "POST",
      // Key in a header, not the URL: URLs end up in proxy and APM logs.
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      body,
    });
    if (res.status !== 503) break;
    logger.warn("photo-edit", `gemini-2.5-flash-image 503 (attempt ${attempt + 1}/3)`);
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  if (!res || !res.ok) {
    const text = res ? await res.text().catch(() => "") : "no response";
    logger.error("photo-edit", `gemini edit failed ${res?.status}`, text.slice(0, 500));
    if (res?.status === 503) throw new UserFacingError("The image service is busy right now. Try again in a moment.");
    throw new Error(`Gemini edit failed ${res?.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as GeminiResponse;
  if (json.promptFeedback?.blockReason) throw new UserFacingError(POLICY_MESSAGES.router);
  const candidate = json.candidates?.[0];
  if (candidate?.finishReason && /SAFETY|PROHIBITED|BLOCKLIST|IMAGE_SAFETY/.test(candidate.finishReason)) {
    throw new UserFacingError(POLICY_MESSAGES.router);
  }
  const b64 = candidate?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
  if (!b64) throw new UserFacingError(NO_IMAGE);
  return Buffer.from(b64, "base64");
}

/** Every image URL in a fal result, for the endpoints that can return several. */
export function falImageUrls(raw: unknown, resultPath: readonly string[]): string[] {
  const r = raw as { images?: { url?: unknown }[]; image?: { url?: unknown } } | null;
  if (Array.isArray(r?.images)) {
    const urls = r.images.map((i) => i?.url).filter((u): u is string => typeof u === "string" && u.length > 0);
    if (urls.length) return urls;
  }
  if (typeof r?.image?.url === "string" && r.image.url) return [r.image.url];
  throw new Error(`No image URL in fal result (expected ${resultPath.join(" or ")})`);
}

/** fal flags NSFW outputs instead of failing: a flagged edit is refused, never delivered. */
function rejectFlagged(raw: unknown) {
  const flags = (raw as { has_nsfw_concepts?: unknown })?.has_nsfw_concepts;
  if (Array.isArray(flags) && flags.some(Boolean)) throw new UserFacingError(POLICY_MESSAGES.router);
}

/**
 * Submit, wait, and download a fal edit. `onSubmitted` hands the caller the
 * request so a cancel can stop fal billing it.
 */
export async function falEdit(
  endpoint: string,
  input: Record<string, unknown>,
  resultPath: readonly string[],
  opts: { signal?: AbortSignal; onSubmitted?: (req: FalRequest) => void },
): Promise<Buffer[]> {
  const request = await falSubmit(endpoint, input);
  opts.onSubmitted?.(request);
  let raw: unknown;
  try {
    raw = await falPollUntilDone(request, { deadlineMs: 5 * 60_000, pollIntervalMs: 2000, signal: opts.signal });
  } catch (err) {
    if (opts.signal?.aborted) void falCancel(request);
    const msg = err instanceof Error ? err.message : String(err);
    // fal reports content-filter refusals as a failed request.
    if (/nsfw|safety|content policy|moderation/i.test(msg)) throw new UserFacingError(POLICY_MESSAGES.router);
    throw err;
  }
  rejectFlagged(raw);
  const urls = falImageUrls(raw, resultPath);
  return Promise.all(urls.map(async (url) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT.transfer) });
    if (!res.ok) throw new Error(`Downloading the fal result failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }));
}
