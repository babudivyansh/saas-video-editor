// The one interface AutoClip talks to.
//
// The strategic boundary this enforces (§43/§44): Clipiro finds the viral
// moment, scores it, reframes it and owns the transcript; a renderer only turns
// an already-chosen clip into a visually polished one. Nothing here can express
// "pick clips for me", so no provider can quietly become the pipeline.
//
// Implementations: providers/native/NativeCaptionRenderer.ts (FFmpeg/ASS, always
// available, free) and providers/submagic/SubmagicAdapter.ts (paid, animated).

import type {
  CaptionExportOptions,
  CaptionRenderHandle,
  CaptionRenderInput,
  CaptionRenderState,
  CaptionRendererHealth,
  CaptionRendererId,
  CaptionWord,
  GetRenderContext,
} from "./types";

export interface CaptionRenderer {
  readonly id: CaptionRendererId;

  /**
   * True when this renderer costs real money per render. The orchestrator uses
   * it to decide whether an idempotency check and a credit charge are required
   * before calling — the native renderer needs neither.
   */
  readonly paid: boolean;

  /**
   * Starts a render. MUST NOT be called without an idempotency check for a
   * paid renderer: see lib/caption-render-job.ts, which is the only sanctioned
   * caller.
   *
   * Implementations create the job with auto-render OFF where the provider
   * supports it, so the user can edit captions before paying for a final
   * render (§12).
   */
  createRender(input: CaptionRenderInput): Promise<CaptionRenderHandle>;

  /**
   * Reads current provider state. Safe to retry — no side effects, no charge.
   *
   * `ctx` carries what the provider's status string can't tell us on its own
   * (see GetRenderContext). Callers should always pass it; it is optional only
   * so a bare status probe stays ergonomic.
   */
  getRender(providerJobId: string, ctx?: GetRenderContext): Promise<CaptionRenderState>;

  /**
   * Pushes Clipiro's (possibly user-edited) transcript back to the provider.
   *
   * Clipiro's transcript stays canonical: a failure here must leave
   * Clip.transcriptJson untouched, so callers persist locally BEFORE calling.
   */
  updateTranscript(providerJobId: string, words: CaptionWord[]): Promise<void>;

  /** Triggers the final render. Paid — same idempotency rules as createRender. */
  exportRender(providerJobId: string, options?: CaptionExportOptions): Promise<CaptionRenderHandle>;

  /** For the admin ops panel. Never throws. */
  health(): Promise<CaptionRendererHealth>;
}
