import { z } from "zod";
import {
  accountSchema,
  accountSettingsPatch,
  accountSettingsSchema,
  activityPageSchema,
  brandKitPatch,
  brandKitResponse,
  contactRequest,
  invoiceSchema,
  invoicesResponse,
  subscriptionChangeResponse,
  clonedVoicesResponse,
  clonedVoiceSchema,
  cloneVoiceRequest,
  renameVoiceRequest,
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
    brandKit: () => api.request("/me/brand-kit", { schema: brandKitResponse }),
    saveBrandKit: (b: z.input<typeof brandKitPatch>) => api.request("/me/brand-kit", { method: "PUT", body: brandKitPatch.parse(b), schema: brandKitResponse }),
    /** A message to the Clipiro team, from the signed-in account's name and email. */
    contact: (b: z.input<typeof contactRequest>) => api.request("/support/contact", { method: "POST", body: contactRequest.parse(b), schema: z.object({ ok: z.literal(true) }) }),
    clonedVoices: () => api.request("/voices/cloned", { schema: clonedVoicesResponse }),
    cloneVoice: (b: z.input<typeof cloneVoiceRequest>) => api.request("/voices/cloned", { method: "POST", body: cloneVoiceRequest.parse(b), schema: z.object({ voice: clonedVoiceSchema }) }),
    renameVoice: (id: string, b: z.input<typeof renameVoiceRequest>) => api.request(`/voices/cloned/${encodeURIComponent(id)}`, { method: "PATCH", body: renameVoiceRequest.parse(b), schema: z.object({ voice: clonedVoiceSchema }) }),
    deleteVoice: (id: string) => api.request(`/voices/cloned/${encodeURIComponent(id)}`, { method: "DELETE", schema: z.object({ ok: z.literal(true) }) }),
    /** Stops renewal at the end of the paid period (a plan bought on the web). */
    cancelSubscription: () => api.request("/billing/cancel", { method: "POST", body: {}, schema: subscriptionChangeResponse }),
    resumeSubscription: () => api.request("/billing/resume", { method: "POST", body: {}, schema: subscriptionChangeResponse }),
    invoices: () => api.request("/billing/invoices", { schema: invoicesResponse }),
    /** One purchase, checked as the caller's; the PDF is then GET /billing/invoices/:id/pdf. */
    invoice: (id: string) => api.request(`/billing/invoices/${encodeURIComponent(id)}`, { schema: z.object({ invoice: invoiceSchema, fileName: z.string().nullable() }) }),
    home: () => api.request("/home", { schema: homeSummarySchema }),
    plans: () => api.request("/plans", { schema: plansResponseSchema }),
    tools: () => api.request("/tools", { schema: toolsResponseSchema }),
  };
}
