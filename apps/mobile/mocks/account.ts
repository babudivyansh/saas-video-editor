import {
  MAX_CLONED_VOICES,
  nameSchema,
  accountSchema,
  activitySchema,
  brandKitSchema,
  clonedVoiceSchema,
  notificationSchema,
  accountSettingsSchema,
  voiceNameSchema,
  type AccountSettings,
  type BrandKitPatch,
  type Account,
  type Activity,
  type AppNotification,
  type BrandKit,
  type ClonedVoice,
} from "@clipiro/shared";
import { z } from "zod";
import { ApiError, respond, wait } from "./core";

// Stand-in for the You tab's API: /me, /me/activity, /voices (+ cloned),
// /brand-kits, /notifications, /notification-preferences, /account/deactivate,
// /billing/cancel. Scenarios (core.ts): "account", "activity", "voices",
// "brandKit", "notifications", "settings", "clone".
//   password "wrong-password" → 401 on delete account (as the auth fake server does)

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const daysAgo = (d: number) => ago(d * 24 * 60);

const STUDIO: Account = {
  user: { id: "b1c673dc-4e2a-49f1-9d0c-7a51e3f0b2aa", name: "Maya Okafor", email: "maya@creatorlab.co", avatarUrl: "asset:creator-golden", hasPassword: true },
  plan: { tier: "studio", term: "yearly", renewsAt: "2027-03-14T00:00:00.000Z", cancelAtPeriodEnd: false },
  creator: { level: "Pro Creator", xp: 1450, nextLevelXp: 2600 },
  clipMinutes: { remaining: 1000, allowance: 1000 },
  aiCredits: { remaining: 1171, allowance: 400 },
  unreadNotifications: 2,
  activeSessions: 2,
  referralPercent: 20,
};

/** A brand-new free account. */
const FREE: Account = {
  user: { ...STUDIO.user, avatarUrl: null },
  plan: { tier: "free", term: null, renewsAt: null, cancelAtPeriodEnd: false },
  creator: { level: "Beginner", xp: 0, nextLevelXp: 500 },
  clipMinutes: { remaining: 30, allowance: 30 },
  aiCredits: { remaining: 10, allowance: 10 },
  unreadNotifications: 0,
  activeSessions: 1,
  referralPercent: 20,
};

let ACCOUNT = STUDIO;
/** Tests: an account made with Google, which has no password. */
export function useGoogleAccount() {
  ACCOUNT = { ...ACCOUNT, user: { ...ACCOUNT.user, hasPassword: false } };
}

export async function getAccount(): Promise<Account> {
  const s = await respond("account");
  return accountSchema.parse(s === "empty" ? FREE : ACCOUNT);
}

const ACTIVITY: Activity[] = [
  { id: "a1", label: "AI Image · Seedream 5.0", kind: "image", delta: -2, unit: "credits", at: ago(90) },
  { id: "a2", label: "AutoClip · Ep. 42", kind: "autoclip", delta: -59, unit: "minutes", at: ago(180) },
  { id: "a3", label: "Voiceover · Brian", kind: "voiceover", delta: -1, unit: "credits", at: daysAgo(1) },
  { id: "a4", label: "Referral reward", kind: "referral", delta: 20, unit: "credits", at: daysAgo(6) },
];

export async function getActivity(): Promise<Activity[]> {
  const s = await respond("activity");
  return z.array(activitySchema).parse(s === "empty" ? [] : ACTIVITY);
}

export async function updateName(name: string): Promise<Account> {
  const n = nameSchema.safeParse(name);
  if (!n.success) throw new ApiError(n.error.issues[0]?.message ?? "Enter your name", 400);
  await wait();
  ACCOUNT = { ...ACCOUNT, user: { ...ACCOUNT.user, name: n.data } };
  return ACCOUNT;
}

/** The web cancels at the end of the paid period (billing/cancel); resume undoes it. */
export async function setCancelAtPeriodEnd(cancel: boolean) {
  await wait();
  if (!cancel && RAZORPAY_PLAN) throw Object.assign(new ApiError("Renewal can’t be switched back on for this plan. It stays active until the end of the paid period.", 409), { code: "cannot_resume" });
  ACCOUNT = { ...ACCOUNT, plan: { ...ACCOUNT.plan, cancelAtPeriodEnd: cancel } };
  return { cancelAtPeriodEnd: cancel, endsAt: ACCOUNT.plan.renewsAt };
}
/** Tests: a Razorpay subscription, which can't be resumed once cancelled. */
let RAZORPAY_PLAN = false;
export function useRazorpayPlan() {
  RAZORPAY_PLAN = true;
}

/** GET /billing/invoices: purchases made on the web. */
export const INVOICES = [
  { id: "pu2", label: "Studio plan", amount: 1499900, currency: "INR", status: "paid" as const, invoiceNumber: "CL-2026-0107", createdAt: "2026-03-14T00:00:00.000Z" },
  { id: "pu1", label: "100 AI credits", amount: 1799, currency: "USD", status: "refunded" as const, invoiceNumber: null, createdAt: "2026-02-02T00:00:00.000Z" },
];

/** Soft-deletes: confirmed by password (or, without one, the emailed code "123456"); purged after 30 days unless they log back in. */
export async function deactivateAccount(b: { password?: string; otp?: string }) {
  await wait();
  if (!b.password && !b.otp) throw new ApiError("Enter your password", 400);
  if (b.password === "wrong-password") throw new ApiError("That password is incorrect", 401);
  if (b.otp && b.otp !== "123456") throw new ApiError("That code is incorrect or expired", 401);
}

/** POST /support/contact: the last message sent (tests check it). */
let lastContact: { subject: string; message: string } | null = null;
export const lastContactMessage = () => lastContact;
export async function sendContact(b: { subject: string; message: string }) {
  await wait();
  lastContact = b;
}

// ── Voices ─────────────────────────────────────────────────────────────────
// GET/POST /voices/cloned, PATCH/DELETE /voices/cloned/:id. The catalogue is
// GET /voices (mocks/editor.ts), which lists these clones first.

const INITIAL_CLONES: ClonedVoice[] = [{ id: "clone:cv_maya", name: "Maya — natural", createdAt: daysAgo(40) }];
let CLONES = INITIAL_CLONES;
let CLONING = true;
let seq = 0;

/** Tests: the server's VOICE_CLONING_ENABLED switch. */
export function setCloningEnabled(on: boolean) {
  CLONING = on;
}

export async function getClonedVoices(): Promise<{ enabled: boolean; max: number; voices: ClonedVoice[] }> {
  const s = await respond("voices");
  return { enabled: CLONING, max: MAX_CLONED_VOICES, voices: z.array(clonedVoiceSchema).parse(s === "empty" ? [] : CLONES) };
}

/** The clones as catalogue entries (what GET /voices puts first). */
export const clonesAsVoices = () => CLONES.map((c) => ({ id: c.id, name: c.name, description: "Your cloned voice", gender: "custom", accent: null, previewUrl: null, creditMultiplier: 1 }));

export async function cloneVoice(b: { name: string; assetId: string }): Promise<ClonedVoice> {
  const n = voiceNameSchema.safeParse(b.name);
  if (!n.success) throw new ApiError(n.error.issues[0]?.message ?? "Name your voice", 400);
  await respond("clone");
  if (!CLONING) throw Object.assign(new ApiError("Voice cloning is coming soon.", 503), { code: "cloning_unavailable" });
  if (CLONES.length >= MAX_CLONED_VOICES) throw Object.assign(new ApiError(`You can have up to ${MAX_CLONED_VOICES} cloned voices.`, 409), { code: "voice_limit" });
  const v: ClonedVoice = { id: `clone:cv_${++seq}`, name: n.data, createdAt: new Date().toISOString() };
  CLONES = [...CLONES, v];
  return v;
}

export async function renameVoice(id: string, name: string): Promise<ClonedVoice> {
  const n = voiceNameSchema.safeParse(name);
  if (!n.success) throw new ApiError(n.error.issues[0]?.message ?? "Name your voice", 400);
  await wait();
  CLONES = CLONES.map((v) => (v.id === id ? { ...v, name: n.data } : v));
  const v = CLONES.find((x) => x.id === id);
  if (!v) throw new ApiError("That voice isn’t here any more.", 404);
  return v;
}

export async function deleteVoice(id: string) {
  await wait();
  CLONES = CLONES.filter((v) => v.id !== id);
}

// ── Brand kit ──────────────────────────────────────────────────────────────

const INITIAL_KIT: BrandKit = {
  id: "bk_main",
  name: "Creator Lab",
  logoUrl: "asset:logo-sample",
  fontName: "Poppins",
  fontSize: 64,
  baseColor: "#f5f7f4",
  highlightColor: "#20d68a",
  outlineColor: "#050908",
  shadowColor: "#000000",
  captionTemplateId: "hormozi",
};
let KIT: BrandKit | null = INITIAL_KIT;

export async function getBrandKit(): Promise<BrandKit | null> {
  const s = await respond("brandKit");
  return s === "empty" ? null : KIT && brandKitSchema.parse(KIT);
}

export async function saveBrandKit(input: BrandKitPatch): Promise<BrandKit> {
  await wait();
  const { logoAssetId, ...patch } = input;
  const logo = logoAssetId === undefined ? {} : { logoUrl: logoAssetId === null ? null : `asset:${logoAssetId}` };
  const next = brandKitSchema.safeParse({ ...(KIT ?? { ...INITIAL_KIT, id: "bk_new", name: "My brand", logoUrl: null }), ...patch, ...logo });
  if (!next.success) throw new ApiError(next.error.issues[0]?.message ?? "Check the brand kit", 400);
  KIT = next.data;
  return KIT;
}

// ── Notifications ──────────────────────────────────────────────────────────

const INITIAL_NOTIFICATIONS: AppNotification[] = [
  { id: "n1", type: "autoclip_render_complete", title: "12 clips are ready", body: "Founders Pod · Ep. 42 finished rendering", href: "/projects/founders-pod-ep-42", thumbnailUrl: "asset:founder-portrait", readAt: null, createdAt: ago(2) },
  { id: "n2", type: "social_post_published", title: "Posted to YouTube Shorts", body: "Nobody tells you this part is live", href: "/social/scheduled-posts", thumbnailUrl: null, readAt: null, createdAt: ago(60) },
  { id: "n3", type: "social_reconnect", title: "Instagram needs reconnecting", body: "Your access token expired", href: "/social", thumbnailUrl: null, readAt: ago(30), createdAt: ago(180) },
  { id: "n4", type: "referral_reward", title: "You earned 20 credits", body: "A friend subscribed with your link", href: "/you/credits", thumbnailUrl: null, readAt: daysAgo(5), createdAt: daysAgo(6) },
  { id: "n5", type: "product_update", title: "New: Nano Banana Pro", body: "Studio-only image model is live", href: "/create/ai-media", thumbnailUrl: null, readAt: daysAgo(7), createdAt: daysAgo(8) },
  { id: "n7", type: "review_reply", title: "The team replied to your review", body: null, href: null, webUrl: "https://clipiro.com/reviews/r1", thumbnailUrl: null, readAt: daysAgo(11), createdAt: daysAgo(11) },
  { id: "n6", type: "social_weekly_summary", title: "Your weekly summary is ready", body: "Views up 18% this week", href: "/social/insights", thumbnailUrl: null, readAt: daysAgo(9), createdAt: daysAgo(10) },
];
let NOTIFICATIONS = INITIAL_NOTIFICATIONS;

export async function getNotifications(): Promise<AppNotification[]> {
  const s = await respond("notifications");
  return z.array(notificationSchema).parse(s === "empty" ? [] : NOTIFICATIONS);
}

export async function markRead(id: string) {
  await wait();
  NOTIFICATIONS = NOTIFICATIONS.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n));
  ACCOUNT = { ...ACCOUNT, unreadNotifications: NOTIFICATIONS.filter((n) => !n.readAt).length };
}

export async function markAllRead() {
  await wait();
  const now = new Date().toISOString();
  NOTIFICATIONS = NOTIFICATIONS.map((n) => (n.readAt ? n : { ...n, readAt: now }));
  ACCOUNT = { ...ACCOUNT, unreadNotifications: 0 };
}

// ── Settings ───────────────────────────────────────────────────────────────

// GET/PATCH /me/settings: what the server keeps (the rest is on the phone).
const INITIAL_SETTINGS: AccountSettings = { language: "en", email: { weeklySummary: true, productUpdates: false } };
let SETTINGS = INITIAL_SETTINGS;

export async function getSettings(): Promise<AccountSettings> {
  await respond("settings");
  return accountSettingsSchema.parse(SETTINGS);
}

export async function saveSettings(patch: { language?: AccountSettings["language"]; email?: Partial<AccountSettings["email"]> }): Promise<AccountSettings> {
  await wait();
  SETTINGS = accountSettingsSchema.parse({ ...SETTINGS, ...patch, email: { ...SETTINGS.email, ...patch.email } });
  return SETTINGS;
}

export function resetAccountMocks() {
  ACCOUNT = STUDIO;
  CLONES = INITIAL_CLONES;
  CLONING = true;
  KIT = INITIAL_KIT;
  NOTIFICATIONS = INITIAL_NOTIFICATIONS;
  SETTINGS = INITIAL_SETTINGS;
  lastContact = null;
  RAZORPAY_PLAN = false;
}
