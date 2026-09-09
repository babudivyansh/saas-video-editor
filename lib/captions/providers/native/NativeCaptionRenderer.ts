// The native renderer: Clipiro's own FFmpeg/ASS caption path, wearing the
// CaptionRenderer interface.
//
// It adds NO rendering code. The actual burn-in has always happened inside
// renderOneClip (lib/autoclip-pipeline.ts) via generateASS + the `subtitles=`
// filter, and it still does. This adapter exists so the factory always has
// something to return, which is what makes premium captions degradable rather
// than load-bearing: when Submagic is disabled, unconfigured, breaker-open or
// simply down, the export still happens — just without the animation (§31).
//
// Because the work is synchronous and local, the lifecycle collapses: there is
// no provider job to poll, no webhook, no transcript round-trip and no charge.
// createRender reports "completed" immediately and the orchestrator falls
// through to the ordinary AutoClip render.
//
// This is also the seam §43 migrates INTO. When Clipiro ships its own animated
// renderer, it replaces the body of this file and nothing above it changes.

import type { CaptionRenderer } from "../../CaptionRenderer";
import type {
  CaptionExportOptions,
  CaptionRenderHandle,
  CaptionRenderInput,
  CaptionRenderState,
  CaptionRendererHealth,
  CaptionWord,
  GetRenderContext,
} from "../../types";

export class NativeCaptionRenderer implements CaptionRenderer {
  readonly id = "native" as const;
  readonly paid = false;

  async createRender(input: CaptionRenderInput): Promise<CaptionRenderHandle> {
    // The "provider job id" is our own job id — there is no external system.
    return { provider: this.id, providerJobId: input.jobId, status: "completed" };
  }

  async getRender(providerJobId: string, _ctx?: GetRenderContext): Promise<CaptionRenderState> {
    void providerJobId;
    void _ctx;
    return { status: "completed" };
  }

  /**
   * No-op: Clip.transcriptJson IS the native renderer's transcript, and the
   * caller has already written it. There is nothing to push anywhere.
   */
  async updateTranscript(providerJobId: string, words: CaptionWord[]): Promise<void> {
    void providerJobId;
    void words;
  }

  async exportRender(providerJobId: string, options?: CaptionExportOptions): Promise<CaptionRenderHandle> {
    void options;
    return { provider: this.id, providerJobId, status: "completed" };
  }

  /** Always healthy — it's local ffmpeg. Render-runtime health is checked
   *  separately by getRenderRuntimeHealth() before any clip render. */
  async health(): Promise<CaptionRendererHealth> {
    return { configured: true, reachable: true, breakerOpen: false };
  }
}

export const nativeCaptionRenderer = new NativeCaptionRenderer();
