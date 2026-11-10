// Photo Edit content policy, the part that needs no model: instructions we
// refuse before spending anything. The Auto router (lib/photo-edit/router.ts)
// screens what these patterns can't, and every provider runs its own output
// safety filter on top.
//
// Refused: sexual or nude edits (of anyone: the photo is of a real person far
// more often than not), and forging identity or money documents. A refused
// edit is never charged.

const SEXUAL = /\b(nude|nudes|naked|nudity|undress(ed|ing)?|topless|bottomless|nsfw|porn\w*|explicit|sexy|sexual\w*|lingerie|bikini|see[\s-]?through|strip(ped|ping)?\s+(her|him|them|off)|remove\s+(her|his|their|my)\s+(clothes|clothing|shirt|top|dress|bra|pants|underwear))\b/i;
const DOCUMENTS = /\b(passport|aadhaa?r|pan\s*card|voter\s*id|driv(er'?s|ing)\s*licen[cs]e|id\s*card|identity\s*card|bank\s*note|banknote|currency\s*note|rupee\s*note|fake\s+(id|document|certificate|receipt|invoice|degree|marksheet)|forge\w*|counterfeit|official\s+(seal|stamp))\b/i;

export type PolicyVerdict = { allowed: true } | { allowed: false; reason: string };

export const POLICY_MESSAGES = {
  sexual: "Photo Edit can't make sexual or nude edits. Try a different instruction.",
  documents: "Photo Edit can't edit ID documents, money or official seals.",
  router: "This edit isn't allowed under our content policy. Try a different instruction.",
} as const;

export function screenPrompt(prompt: string): PolicyVerdict {
  if (SEXUAL.test(prompt)) return { allowed: false, reason: POLICY_MESSAGES.sexual };
  if (DOCUMENTS.test(prompt)) return { allowed: false, reason: POLICY_MESSAGES.documents };
  return { allowed: true };
}
