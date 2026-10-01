import { describe, expect, it } from "vitest";
import {
  AUTOCLIP_LIMITS,
  IMAGE_MODEL_CATALOG as MOBILE_MODELS,
  DEFAULT_IMAGE_MODEL_ID,
  audioToolCredits,
  autoClipMinutes,
  isAllowedSourceUrl,
  voiceoverCredits,
  type PlanTier,
} from "@clipiro/shared";
import { voiceFxCredits, vocalRemoverCredits, voiceoverCredits as webVoiceoverCredits } from "./audio-pricing";
import { billableSourceMinutes } from "./autoclip-pricing";
import { DEFAULT_IMAGE_MODEL_ID as WEB_DEFAULT_MODEL, IMAGE_MODELS } from "./models/imageModels";
import { MAX_UPLOAD_BYTES_BY_TIER, TIER_MAX_AUTOCLIP_SOURCE_SECONDS } from "./plans/tiers";
import { isAllowedSourceUrl as webIsAllowedSourceUrl } from "./url-import";

// The phone app copies these rules into @clipiro/shared so it can check input and show prices offline. If the web
// changes one, this fails until the copy is updated.

const TIERS: PlanTier[] = ["free", "creator", "pro", "studio"];

describe("mobile Create rules match the web", () => {
  it("accepts and rejects the same source links", () => {
    const samples = [
      "https://www.youtube.com/watch?v=abc",
      "https://youtu.be/abc",
      "https://m.youtube.com/watch?v=abc",
      "https://music.youtube.com/watch?v=abc",
      "https://vimeo.com/123",
      "https://player.vimeo.com/video/123",
      "https://www.loom.com/share/abc",
      "https://drive.google.com/file/d/abc/view",
      "https://docs.google.com/file/d/abc",
      "https://www.dropbox.com/s/abc/v.mp4",
      "http://youtube.com/watch?v=abc",
      "https://evil.com/youtube.com",
      "https://youtube.com.evil.com/x",
      "https://tiktok.com/@a/video/1",
      "not a url",
      "",
    ];
    for (const url of samples) expect({ url, ok: isAllowedSourceUrl(url) }).toEqual({ url, ok: webIsAllowedSourceUrl(url) });
  });

  it("has the same per-plan AutoClip limits", () => {
    for (const t of TIERS) {
      expect(AUTOCLIP_LIMITS[t].maxBytes).toBe(MAX_UPLOAD_BYTES_BY_TIER[t]);
      expect(AUTOCLIP_LIMITS[t].maxSourceSec).toBe(TIER_MAX_AUTOCLIP_SOURCE_SECONDS[t]);
    }
  });

  it("prices AutoClip and the audio tools the same", () => {
    for (const sec of [1, 59, 60, 61, 3599, 3600, 3540, 21600]) expect(autoClipMinutes(sec)).toBe(billableSourceMinutes(sec));
    for (const chars of [1, 499, 500, 501, 2000]) expect(voiceoverCredits(chars)).toBe(webVoiceoverCredits(chars));
    for (const sec of [1, 29, 30, 31, 89, 90, 300]) {
      expect(audioToolCredits("enhance", sec)).toBe(voiceFxCredits(sec));
      expect(audioToolCredits("vocal", sec)).toBe(vocalRemoverCredits(sec));
    }
  });

  it("lists the same image models, prices, plans and sizes", () => {
    const order: PlanTier[] = TIERS;
    const web = IMAGE_MODELS.map((m) => ({
      id: m.id,
      name: m.displayName,
      credits: m.creditCost,
      minPlan: order.find((t) => (m.allowedTiers as readonly string[]).includes(t)),
      ratios: m.aspectRatios,
    }));
    expect(MOBILE_MODELS).toEqual(web);
    expect(DEFAULT_IMAGE_MODEL_ID).toBe(WEB_DEFAULT_MODEL);
  });
});
