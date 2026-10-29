// The shapes a Caption Studio export can ask for. Its own module so the
// Studio page can import it without pulling in the server side of
// lib/editor/caption-export.ts (Prisma, S3).

import type { Aspect } from "./types";

/** In the order the picker shows them. */
export const CAPTION_EXPORT_ASPECTS = ["9:16", "4:5", "1:1", "16:9", "original"] as const satisfies readonly Aspect[];
export type CaptionExportAspect = (typeof CAPTION_EXPORT_ASPECTS)[number];
