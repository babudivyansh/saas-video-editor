// Server-side entry point to the caption template library.
//
// The templates live in packages/shared/src/captions/templates.ts so the web
// app, the render workers, the editor and the Android app all read the same
// 50 records. This module re-exports them and adds the alias-aware lookup the
// server uses for stored ids (old native ids and retired partner ids resolve
// to their closest current template).

import {
  CAPTION_FAMILIES,
  CAPTION_TEMPLATES,
  findCaptionTemplate,
  isKnownTemplateId,
  resolveCaptionTemplate,
  resolveTemplateId,
  templateTierAllowed,
  type CaptionTemplateSpec,
} from "@clipiro/shared/caption-templates";

export { planEmoji } from "@clipiro/shared/caption-emoji";
export {
  CAPTION_FAMILIES,
  CAPTION_TEMPLATES,
  findCaptionTemplate,
  isKnownTemplateId,
  resolveCaptionTemplate,
  resolveTemplateId,
  templateTierAllowed,
  type CaptionTemplateSpec,
};

/** Alias-aware lookup; null only when no id was given. */
export function getCaptionTemplate(id: string | null | undefined): CaptionTemplateSpec | null {
  return id ? resolveCaptionTemplate(id) : null;
}
