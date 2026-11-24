// Request bodies for the Admin → Campaigns API (app/api/admin/campaigns).

import { z } from "zod";
import { campaignBlocksSchema } from "./content";
import { campaignAudienceSchema } from "./audience-schema";
import { MAX_DAILY_CAP } from "./budget-constants";

const name = z.string().trim().min(1).max(120);
const subject = z.string().trim().min(1).max(150);
const preheader = z.string().trim().min(1).max(200);

export const campaignCreateSchema = z
  .object({ name, subject, preheader, blocks: campaignBlocksSchema, audience: campaignAudienceSchema })
  .strict();

export const campaignPatchSchema = z
  .object({
    name: name.optional(),
    subject: subject.optional(),
    preheader: preheader.optional(),
    blocks: campaignBlocksSchema.optional(),
    audience: campaignAudienceSchema.optional(),
  })
  .strict();

export const campaignPreviewSchema = z.object({ subject, preheader, blocks: campaignBlocksSchema }).strict();

export const campaignActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("schedule"), scheduledAt: z.iso.datetime({ offset: true }) }).strict(),
  z.object({ action: z.literal("unschedule") }).strict(),
  z.object({ action: z.literal("pause") }).strict(),
  z.object({ action: z.literal("resume") }).strict(),
  z.object({ action: z.literal("cancel") }).strict(),
]);

export const campaignSettingsSchema = z.object({ dailyCap: z.number().int().min(0).max(MAX_DAILY_CAP) }).strict();
