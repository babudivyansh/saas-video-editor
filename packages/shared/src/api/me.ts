import { z } from "zod";
import {
  accountSchema,
  accountSettingsPatch,
  accountSettingsSchema,
  activityPageSchema,
  deactivateRequest,
  plansResponseSchema,
  updateProfileRequest,
} from "../schemas/account";
import { homeSummarySchema, toolsResponseSchema } from "../schemas/home";
import type { ApiClient } from "./client";

// /api/mobile/v1/me, /home, /plans, /tools.
export function meApi(api: ApiClient) {
  return {
    account: () => api.request("/me", { schema: accountSchema }),
    rename: (b: z.input<typeof updateProfileRequest>) => api.request("/me", { method: "PATCH", body: updateProfileRequest.parse(b), schema: accountSchema }),
    activity: (cursor?: string | null) => api.request(`/me/activity${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { schema: activityPageSchema }),
    settings: () => api.request("/me/settings", { schema: accountSettingsSchema }),
    updateSettings: (b: z.input<typeof accountSettingsPatch>) =>
      api.request("/me/settings", { method: "PATCH", body: accountSettingsPatch.parse(b), schema: accountSettingsSchema }),
    /** Emails a code for accounts with no password (account.user.hasPassword false). */
    sendStepUpCode: () => api.request("/me/step-up-code", { method: "POST", body: {}, schema: z.object({ ok: z.literal(true) }).loose() }),
    deactivate: (b: z.input<typeof deactivateRequest>) =>
      api.request("/me/deactivate", { method: "POST", body: deactivateRequest.parse(b), schema: z.object({ ok: z.literal(true), purgeAt: z.string().nullable() }) }),
    home: () => api.request("/home", { schema: homeSummarySchema }),
    plans: () => api.request("/plans", { schema: plansResponseSchema }),
    tools: () => api.request("/tools", { schema: toolsResponseSchema }),
  };
}
