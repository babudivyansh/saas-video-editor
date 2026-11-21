// The shape of Clip.aiMeta — everything the AI stages decided for one clip.
//
// Leaf module (types plus one parser): the pipeline, the renderer, the
// re-render path and the tests all read it, and none of them should pull in a
// provider client just to know the shape.

import type { AiFeatureSet } from "@/lib/autoclip-ai/config";
import type { ResolvedEditPlan } from "@/lib/autoclip-ai/edit-plan";

/** How one B-roll window was filled, for ops and for the admin win-rate table. */
export interface BrollDecision {
  startSec: number;
  endSec: number;
  /** Where the winning insert came from, or null when nothing cleared the bar. */
  provider: string | null;
  externalId: string | null;
  query: string;
  score: number | null;
  why: string | null;
  costUsd: number;
}

export type SceneShotType =
  | "single" | "dialogue" | "group" | "screen" | "gameplay_facecam" | "product" | "broll_like";

/** Box as frame fractions, the same basis as FaceBox / CropKeyframe. */
export interface NormBox { x: number; y: number; w: number; h: number }

/** One shot as Gemini labelled it (Stage 4). Times are clip-relative seconds. */
export interface SceneShot {
  startSec: number;
  endSec: number;
  type: SceneShotType;
  confidence: number;
  subjectBox?: NormBox;
  facecamBox?: NormBox;
  screenBox?: NormBox;
}

/** A non-face subject followed through one shot (Stage 5, SAM 2). */
export interface SubjectTrack {
  startSec: number;
  endSec: number;
  /** Clip-relative samples. */
  samples: { t: number; x: number; y: number; w: number; h: number }[];
}

export interface AiCostEntry { kind: string; usd: number }

export interface AiMeta {
  v: 1;
  /** Which features were on for the run that produced this. */
  features: Partial<AiFeatureSet>;
  editPlan?: ResolvedEditPlan | null;
  broll?: BrollDecision[];
  /** Shot boundaries the reframe honoured (clip-relative seconds). */
  shots?: number[];
  scenes?: SceneShot[];
  tracks?: SubjectTrack[];
  cost?: AiCostEntry[];
  /** Best-effort steps that failed, by name — never user-facing. */
  skipped?: string[];
}

export function parseAiMeta(raw: unknown): AiMeta | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const m = raw as Partial<AiMeta>;
  if (m.v !== 1) return null;
  return { ...m, v: 1, features: m.features ?? {} } as AiMeta;
}
