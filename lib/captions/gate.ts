// The caption template plan gate: Creator and Pro templates need that plan.
//
// Enforced wherever a template is CHOSEN (run create, clip style save,
// re-render, brand kit, editor export). Keeping a template a clip or kit
// already uses is always allowed, so a downgrade never breaks re-renders of
// clips made on the higher plan.

import { getUserTier } from "@/lib/auth";
import { resolveCaptionTemplate, resolveTemplateId, templateTierAllowed } from "@/lib/caption-templates";

export interface TemplateLocked {
  status: 403;
  body: { error: "template_locked"; templateId: string; requiredTier: string };
}

export async function checkTemplateChoice(
  userId: string,
  nextTemplateId: string | null | undefined,
  currentTemplateId?: string | null,
): Promise<TemplateLocked | null> {
  if (!nextTemplateId) return null;
  const next = resolveCaptionTemplate(nextTemplateId);
  if (currentTemplateId && resolveTemplateId(currentTemplateId) === next.id) return null;
  if (next.tier === "free") return null;
  const tier = await getUserTier(userId);
  if (templateTierAllowed(next.tier, tier)) return null;
  return { status: 403, body: { error: "template_locked", templateId: next.id, requiredTier: next.tier } };
}
