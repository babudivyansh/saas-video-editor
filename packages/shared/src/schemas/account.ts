import { z } from "zod";
import { planTierSchema } from "./create";

// The You tab: profile, balances, plans and packs, voices, brand kit,
// notifications and settings. Values the web enforces are copied here and
// pinned by lib/mobile-account-schema.test.ts.

// ── Languages (lib/i18n-locales.ts) ────────────────────────────────────────
export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "hi", name: "हिन्दी" },
  { code: "ta", name: "தமிழ்" },
  { code: "te", name: "తెలుగు" },
  { code: "bn", name: "বাংলা" },
  { code: "mr", name: "मराठी" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "pt", name: "Português" },
  { code: "ar", name: "العربية" },
  { code: "ja", name: "日本語" },
  { code: "zh", name: "中文" },
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]["code"];
const languageCodes = LANGUAGES.map((l) => l.code) as [LanguageCode, ...LanguageCode[]];

// ── Creator level (lib/quest-config.ts) ────────────────────────────────────
/** Sum of every quest's XP: reaching it is the top rank. */
export const QUEST_TOTAL_XP = 2600;
export const RANKS = [
  { level: "Beginner", minXp: 0 },
  { level: "Creator", minXp: 500 },
  { level: "Pro Creator", minXp: 1100 },
  { level: "Clipiro Master", minXp: QUEST_TOTAL_XP },
] as const;

// ── Plans and packs ────────────────────────────────────────────────────────
// Prices are USD cents (lib/currency.ts price book; credit packs are the web's
// FX conversion of the INR rows). Limits from lib/plans/tiers.ts + prisma/seed.ts.
export const YEARLY_DISCOUNT_PCT = 33;
export const ROLLOVER_MULTIPLIER = 2;
export const MONEY_BACK_DAYS = 3;

export const PLANS = [
  { tier: "free", name: "Free", tagline: "Try every tool, no card", monthlyCents: 0, yearlyCents: 0, minutes: 30, credits: 10, storageGb: 0.5, uploadHours: 0.5, perks: ["Watermarked Auto Clips"] },
  { tier: "creator", name: "Creator", tagline: "For a steady posting habit", monthlyCents: 1500, yearlyCents: 11999, minutes: 150, credits: 50, storageGb: 2, uploadHours: 2, perks: ["No watermark, animated captions", "Social Tracker"] },
  { tier: "pro", name: "Pro", tagline: "Premium models, more output", monthlyCents: 2900, yearlyCents: 23299, minutes: 400, credits: 150, storageGb: 5, uploadHours: 4, perks: ["Clip Dubbing, Face Swap", "Priority rendering"] },
  { tier: "studio", name: "Studio", tagline: "High volume, fastest queue", monthlyCents: 5900, yearlyCents: 47399, minutes: 1000, credits: 400, storageGb: 15, uploadHours: 6, perks: ["Nano Banana Pro", "Fastest rendering"] },
] as const;
export const POPULAR_TIER: (typeof PLANS)[number]["tier"] = "pro";

export const CREDIT_PACKS = [
  { id: "pack_mini", name: "Mini", credits: 30, cents: 699 },
  { id: "pack_starter", name: "Starter", credits: 100, cents: 1799 },
  { id: "pack_pro", name: "Pro", credits: 280, cents: 4499 },
  { id: "pack_studio", name: "Studio", credits: 640, cents: 10199, bestValue: true },
] as const;
export const MINUTE_PACKS = [
  { id: "minutes_100", minutes: 100, cents: 1199 },
  { id: "minutes_300", minutes: 300, cents: 2999 },
  { id: "minutes_1000", minutes: 1000, cents: 8999 },
] as const;

/** 1199 → "$11.99", 1500 → "$15", 1942 → "$19.42". */
export function usd(cents: number): string {
  const d = cents / 100;
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}`;
}

/** What one month costs on a term ("$9.99" a month for Creator yearly). */
export function perMonthCents(plan: (typeof PLANS)[number], term: "monthly" | "yearly"): number {
  return term === "monthly" ? plan.monthlyCents : Math.round(plan.yearlyCents / 12);
}

// ── Profile and balances ───────────────────────────────────────────────────
export const accountSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    avatarUrl: z.string().nullable(),
    /** Google-created accounts have none: sensitive steps confirm with an emailed code. */
    hasPassword: z.boolean(),
  }),
  plan: z.object({ tier: planTierSchema, term: z.enum(["monthly", "yearly"]).nullable(), renewsAt: z.string().nullable(), cancelAtPeriodEnd: z.boolean() }),
  creator: z.object({ level: z.string(), xp: z.number().int().min(0), nextLevelXp: z.number().int().positive() }),
  clipMinutes: z.object({ remaining: z.number().int().min(0), allowance: z.number().int().min(0) }),
  aiCredits: z.object({ remaining: z.number().int().min(0), allowance: z.number().int().min(0) }),
  unreadNotifications: z.number().int().min(0),
  /** Signed-in devices (the web's Sessions page). */
  activeSessions: z.number().int().min(0),
  referralPercent: z.number(),
});
export type Account = z.infer<typeof accountSchema>;

export const activitySchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(["image", "autoclip", "voiceover", "referral", "purchase", "refund", "other"]),
  /** Signed: spends are negative. */
  delta: z.number().int(),
  unit: z.enum(["credits", "minutes"]),
  at: z.string(),
});
export type Activity = z.infer<typeof activitySchema>;

// ── Voices (lib/cloned-voices.ts, lib/voices/catalog.ts) ───────────────────
export const MAX_CLONED_VOICES = 3;
export const CLONE_SAMPLE_SECONDS = 30;
export const VOICE_NAME_MAX = 40;

export const clonedVoiceSchema = z.object({ id: z.string(), name: z.string(), isDefault: z.boolean(), createdAt: z.string() });
export type ClonedVoice = z.infer<typeof clonedVoiceSchema>;
export const libraryVoiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  gender: z.enum(["male", "female", "neutral"]),
  age: z.enum(["young", "middle", "mature"]),
  description: z.string(),
});
export type LibraryVoice = z.infer<typeof libraryVoiceSchema>;
export const voiceNameSchema = z.string().trim().min(1, "Name your voice").max(VOICE_NAME_MAX, `Keep it under ${VOICE_NAME_MAX} characters`);

// ── Brand kit (prisma BrandKit) ────────────────────────────────────────────
// The web stores caption colours as ASS strings ("&H00FFFFFF", lib/ass-color.ts);
// the mobile API hands them over as #rrggbb.
/** Fonts the web's caption templates use (lib/caption-templates.ts). */
export const CAPTION_FONTS = ["Poppins", "Montserrat", "Impact", "Anton", "Playfair Display", "Outfit", "Oswald", "Bebas Neue"] as const;
export const BRAND_FONT_SIZE = { min: 24, max: 120, step: 4 } as const;
/** Quick picks in the colour sheet. */
export const BRAND_COLOR_PRESETS = ["#ffffff", "#f5f7f4", "#000000", "#050908", "#20d68a", "#c8ff55", "#facc15", "#f97316", "#ef4444", "#ec4899", "#8b5cf6", "#4ea8ff"] as const;
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #20d68a");
export const brandKitSchema = z.object({
  id: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  fontName: z.string(),
  fontSize: z.number().int().min(8).max(200),
  baseColor: hex,
  highlightColor: hex,
  outlineColor: hex,
  shadowColor: hex,
  captionTemplateId: z.string().nullable(),
});
export type BrandKit = z.infer<typeof brandKitSchema>;
/** GET /me/brand-kit: the most recent kit, or null before one is made. */
export const brandKitResponse = z.object({ kit: brandKitSchema.nullable() });
/**
 * PUT /me/brand-kit: changes the kit (made on first save). A new logo is an
 * image already uploaded to Assets (logoAssetId); null removes it.
 */
export const brandKitPatch = z
  .object({
    name: z.string().trim().min(1, "Name your brand kit").max(100),
    fontName: z.enum(CAPTION_FONTS, { error: "Choose a font from the list" }),
    fontSize: z.number().int().min(BRAND_FONT_SIZE.min).max(BRAND_FONT_SIZE.max),
    baseColor: hex,
    highlightColor: hex,
    outlineColor: hex,
    shadowColor: hex,
    captionTemplateId: z.string().max(64).nullable(),
    logoAssetId: z.string().min(1).nullable(),
  })
  .partial();
export type BrandKitPatch = z.input<typeof brandKitPatch>;
/** Defaults for a kit's empty fields (the web's own "Classic" caption look). */
export const BRAND_KIT_DEFAULTS = { name: "My brand", fontName: "Poppins", fontSize: 64, baseColor: "#ffffff", highlightColor: "#20d68a", outlineColor: "#000000", shadowColor: "#000000" } as const;

// ── Support (POST /support/contact → the web's /api/contact) ──────────────
export const SUPPORT_TOPICS = [
  { id: "support", label: "Help with the app or my account" },
  { id: "billing", label: "Billing or a refund" },
  { id: "feedback", label: "Feedback or an idea" },
] as const;
export const contactRequest = z.object({
  subject: z.enum(["support", "billing", "feedback"]),
  message: z.string().trim().min(10, "Tell us a little more").max(5000, "Keep it under 5,000 characters"),
});

export const BRAND_COLOR_FIELDS = [
  { key: "baseColor", label: "Text" },
  { key: "highlightColor", label: "Highlight" },
  { key: "outlineColor", label: "Outline" },
  { key: "shadowColor", label: "Shadow" },
] as const;

// ── Notifications (prisma Notification; types from lib/notify.ts) ─────────
export const notificationSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  /** The app screen to open ("/projects/…"), or null when it only exists on the web. */
  href: z.string().nullable(),
  /** The same link on clipiro.com, for anything the app can't open itself. */
  webUrl: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AppNotification = z.infer<typeof notificationSchema>;
export type NotificationCategory = "renders" | "social" | "account";

/** Which tab a notification type belongs to. Unknown types are Account. */
export function notificationCategory(type: string): NotificationCategory {
  if (type.startsWith("autoclip_") || type.startsWith("render_")) return "renders";
  if (type.startsWith("social_")) return "social";
  return "account";
}

// ── Settings ───────────────────────────────────────────────────────────────
/** Which pushes this phone wants. The server checks them before sending. */
export const pushPrefsSchema = z.object({ renderFinished: z.boolean(), postPublished: z.boolean() });
export type PushPrefs = z.infer<typeof pushPrefsSchema>;

export const settingsSchema = z.object({
  language: z.enum(languageCodes),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]),
  captionTemplateId: z.string(),
  /** Phone-only preferences. */
  autoplay: z.boolean(),
  /** Push switches: kept on the phone and sent with its token (POST /devices). */
  push: pushPrefsSchema,
  /** The web's NotificationPreference email switches. */
  email: z.object({ weeklySummary: z.boolean(), productUpdates: z.boolean() }),
});
export type Settings = z.infer<typeof settingsSchema>;

/** Deleting an account deactivates it; it is purged after this many days
 *  unless the user logs back in (app/api/account/deactivate). */
export const ACCOUNT_PURGE_DAYS = 30;

// ── Mobile API (/api/mobile/v1/me, /plans) ─────────────────────────────────

/** GET /me/activity?cursor= → newest first. */
export const activityPageSchema = z.object({ items: z.array(activitySchema), nextCursor: z.string().nullable() });
export type ActivityPage = z.infer<typeof activityPageSchema>;

/** PATCH /me */
export const updateProfileRequest = z.object({ name: z.string() });
/** POST /me/deactivate: the password, or (no password) the code from POST /me/step-up-code. */
export const deactivateRequest = z
  .object({ password: z.string().min(1).optional(), otp: z.string().trim().min(1).optional() })
  .refine((b) => !!b.password || !!b.otp, { message: "Enter your password", path: ["password"] });

/**
 * The settings the server keeps: language and two email switches (the web's
 * NotificationPreference). Defaults, playback, uploads and push stay on the
 * phone (`settingsSchema` above).
 */
export const accountSettingsSchema = z.object({
  language: z.enum(languageCodes),
  email: z.object({ weeklySummary: z.boolean(), productUpdates: z.boolean() }),
});
export type AccountSettings = z.infer<typeof accountSettingsSchema>;
export const accountSettingsPatch = z.object({
  language: z.enum(languageCodes, { error: "Choose a language from the list" }).optional(),
  email: z.object({ weeklySummary: z.boolean().optional(), productUpdates: z.boolean().optional() }).optional(),
});

const priceSchema = z.object({ usdCents: z.number().int().nonnegative(), inrPaise: z.number().int().nonnegative() });
/** GET /plans: live prices (admins can change them on the web). Read-only until Phase 12. */
export const plansResponseSchema = z.object({
  plans: z.array(
    z.object({
      tier: planTierSchema,
      name: z.string(),
      tagline: z.string(),
      monthly: priceSchema,
      yearly: priceSchema,
      minutes: z.number().int().nonnegative(),
      credits: z.number().int().nonnegative(),
      storageGb: z.number(),
      uploadHours: z.number(),
      perks: z.array(z.string()),
    }),
  ),
  creditPacks: z.array(z.object({ id: z.string(), name: z.string(), credits: z.number().int().positive(), price: priceSchema, bestValue: z.boolean() })),
  minutePacks: z.array(z.object({ id: z.string(), minutes: z.number().int().positive(), price: priceSchema })),
  yearlyDiscountPct: z.number().int().min(0).max(100),
});
export type PlansResponse = z.infer<typeof plansResponseSchema>;

/** GET /notifications?cursor= — newest first, plus the unread count. */
export const notificationsPageSchema = z.object({ items: z.array(notificationSchema), nextCursor: z.string().nullable(), unreadCount: z.number().int().nonnegative() });
export const unreadCountSchema = z.object({ unreadCount: z.number().int().nonnegative() });

/**
/**
 * POST /devices — register this phone for push notifications, with its push
 * switches (send again when they change). An Expo push token
 * ("ExponentPushToken[…]") or a raw FCM token.
 */
export const registerDeviceRequest = z.object({
  token: z.string().trim().min(10).max(4096),
  provider: z.enum(["expo", "fcm"]),
  deviceName: z.string().trim().max(100).optional(),
  appVersion: z.string().trim().max(32).optional(),
  prefs: pushPrefsSchema.optional(),
});
/** DELETE /devices — stop pushes to this phone (e.g. notifications turned off). */
export const unregisterDeviceRequest = z.object({ token: z.string().trim().min(10).max(4096) });
