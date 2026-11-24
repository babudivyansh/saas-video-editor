// What an admin can put in a campaign email (Admin → Campaigns).
//
// A small, closed set of blocks stored as JSON on EmailCampaign.blocks and
// validated here on every write. Every field is plain text — the email block
// renderer (lib/email/blocks.ts) escapes all of it — so a campaign cannot carry
// markup, scripts or a javascript: link no matter what is posted.
//
// Kept free of prisma/env imports: the email template that renders these
// (lib/email/templates/campaign.ts) imports this file, and the render layer
// must stay unit-testable without an environment.

import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) => z.string().trim().max(max).optional();

/** Links: http(s) only, or a site-relative path. */
const href = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => /^https?:\/\//i.test(v) || v.startsWith("/"), "Link must start with https:// or /");

/** Images must be absolute https — an inbox can't resolve a relative path. */
const imageSrc = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => /^https:\/\//i.test(v), "Image URL must start with https://");

const tone = z.enum(["brand", "success", "warning", "neutral"]);

export const campaignBlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("heading"), text: text(200) }).strict(),
  z.object({ kind: z.literal("paragraph"), text: text(5000) }).strict(),
  z.object({ kind: z.literal("button"), label: text(60), href }).strict(),
  z.object({ kind: z.literal("image"), src: imageSrc, alt: text(200), href: href.optional() }).strict(),
  z
    .object({
      kind: z.literal("offer"),
      label: text(80),
      price: text(40),
      was: optText(40),
      caption: optText(200),
    })
    .strict(),
  z.object({ kind: z.literal("coupon"), code: text(40), caption: optText(200) }).strict(),
  z.object({ kind: z.literal("callout"), tone, title: optText(120), body: text(1000) }).strict(),
  z.object({ kind: z.literal("list"), items: z.array(text(300)).min(1).max(12) }).strict(),
  z.object({ kind: z.literal("divider") }).strict(),
  z.object({ kind: z.literal("spacer") }).strict(),
]);

export type CampaignBlock = z.infer<typeof campaignBlockSchema>;
export type CampaignBlockKind = CampaignBlock["kind"];

export const campaignBlocksSchema = z.array(campaignBlockSchema).min(1).max(40);

/** The email's own fields, shared by create, edit and preview. */
export const campaignContentSchema = z
  .object({
    subject: text(150),
    preheader: text(200),
    blocks: campaignBlocksSchema,
  })
  .strict();

export type CampaignContent = z.infer<typeof campaignContentSchema>;

/** Personalisation token admins can type in headings and paragraphs. */
export const NAME_TOKEN = "{{name}}";

/** A slug for utm_campaign: lowercase, a-z0-9 and dashes, ≤ 60 chars. */
export function utmSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "campaign";
}
