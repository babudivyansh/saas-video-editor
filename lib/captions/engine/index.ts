// Clipiro's caption engine: template → ASS subtitles + overlay plan → ffmpeg
// filter fragment. Used by AutoClip renders, previews, dubs and the editor
// export. See packages/shared/src/captions/templates.ts for the templates.

export { buildCaptionTrack, type CaptionTrack, type CaptionTrackOptions, type EmojiOverlay, type GlassPlan } from "./ass";
export { buildCaptionFilterChain, escapeFilterArg, EMOJI_DIR } from "./filters";
export { CAPTION_FONTS_DIR, resolveFace, hasFace } from "./fonts";
export type { EngineWord, CaptionLayout } from "./layout";
