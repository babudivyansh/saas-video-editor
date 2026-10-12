import {
  MAX_CLONED_VOICES,
  nameSchema,
  accountSchema,
  activitySchema,
  brandKitSchema,
  clonedVoiceSchema,
  libraryVoiceSchema,
  notificationSchema,
  settingsSchema,
  voiceNameSchema,
  type Account,
  type Activity,
  type AppNotification,
  type BrandKit,
  type ClonedVoice,
  type LibraryVoice,
  type Settings,
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

export async function updateName(name: string) {
  const n = nameSchema.safeParse(name);
  if (!n.success) throw new ApiError(n.error.issues[0]?.message ?? "Enter your name", 400);
  await wait();
  ACCOUNT = { ...ACCOUNT, user: { ...ACCOUNT.user, name: n.data } };
}

/** The web cancels at the end of the paid period (billing/cancel); resume undoes it. */
export async function setCancelAtPeriodEnd(cancel: boolean) {
  await wait();
  ACCOUNT = { ...ACCOUNT, plan: { ...ACCOUNT.plan, cancelAtPeriodEnd: cancel } };
}

/** Soft-deletes: password-confirmed, purged after 30 days unless they log back in. */
export async function deactivateAccount(password: string) {
  await wait();
  if (!password) throw new ApiError("Enter your password", 400);
  if (password === "wrong-password") throw new ApiError("That password is incorrect", 401);
}

// ── Voices ─────────────────────────────────────────────────────────────────

const INITIAL_CLONES: ClonedVoice[] = [{ id: "cv_maya", name: "Maya — natural", isDefault: true, createdAt: daysAgo(40) }];
let CLONES = INITIAL_CLONES;
let seq = 0;

// Active voices from lib/voices/catalog.ts (22 of them; retired slugs left out).
export const VOICE_LIBRARY: LibraryVoice[] = [
  ["brian", "Brian", "male", "middle", "Deep, Resonant and Comforting"],
  ["george", "George", "male", "middle", "Warm, Captivating Storyteller"],
  ["sarah", "Sarah", "female", "young", "Mature, Reassuring, Confident"],
  ["jessica", "Jessica", "female", "young", "Playful, Bright, Warm"],
  ["roger", "Roger", "male", "middle", "Laid-Back, Casual, Resonant"],
  ["laura", "Laura", "female", "young", "Enthusiast, Quirky Attitude"],
  ["charlie", "Charlie", "male", "young", "Deep, Confident, Energetic"],
  ["callum", "Callum", "male", "middle", "Husky Trickster"],
  ["river", "River", "neutral", "middle", "Relaxed, Neutral, Informative"],
  ["harry", "Harry", "male", "young", "Fierce Warrior"],
  ["liam", "Liam", "male", "young", "Energetic, Social Media Creator"],
  ["alice", "Alice", "female", "middle", "Clear, Engaging Educator"],
  ["matilda", "Matilda", "female", "middle", "Knowledgable, Professional"],
  ["will", "Will", "male", "young", "Relaxed Optimist"],
  ["eric", "Eric", "male", "middle", "Smooth, Trustworthy"],
  ["bella", "Bella", "female", "middle", "Professional, Bright, Warm"],
  ["chris", "Chris", "male", "middle", "Charming, Down-to-Earth"],
  ["daniel", "Daniel", "male", "middle", "Steady Broadcaster"],
  ["lily", "Lily", "female", "middle", "Velvety Actress"],
  ["adam", "Adam", "male", "middle", "Dominant, Firm"],
  ["bill", "Bill", "male", "mature", "Wise, Mature, Balanced"],
  ["sunny-singh", "Sunny Singh", "male", "young", "Dramatic, Gripping & Vivid"],
].map(([id, name, gender, age, description]) => ({ id, name, gender, age, description }) as LibraryVoice);

export async function getClonedVoices(): Promise<ClonedVoice[]> {
  const s = await respond("voices");
  return z.array(clonedVoiceSchema).parse(s === "empty" ? [] : CLONES);
}

export async function getVoiceLibrary(): Promise<LibraryVoice[]> {
  await respond("voices");
  return z.array(libraryVoiceSchema).parse(VOICE_LIBRARY);
}

export async function cloneVoice(name: string, source: "record" | "upload"): Promise<ClonedVoice> {
  const n = voiceNameSchema.safeParse(name);
  if (!n.success) throw new ApiError(n.error.issues[0]?.message ?? "Name your voice", 400);
  await respond("clone");
  if (CLONES.length >= MAX_CLONED_VOICES) throw new ApiError(`You can have up to ${MAX_CLONED_VOICES} cloned voices.`, 409);
  void source;
  const v: ClonedVoice = { id: `cv_${++seq}`, name: n.data, isDefault: CLONES.length === 0, createdAt: new Date().toISOString() };
  CLONES = [...CLONES, v];
  return v;
}

export async function renameVoice(id: string, name: string) {
  const n = voiceNameSchema.safeParse(name);
  if (!n.success) throw new ApiError(n.error.issues[0]?.message ?? "Name your voice", 400);
  await wait();
  CLONES = CLONES.map((v) => (v.id === id ? { ...v, name: n.data } : v));
}

export async function deleteVoice(id: string) {
  await wait();
  const wasDefault = CLONES.find((v) => v.id === id)?.isDefault;
  CLONES = CLONES.filter((v) => v.id !== id);
  if (wasDefault && CLONES[0]) CLONES = CLONES.map((v, i) => (i === 0 ? { ...v, isDefault: true } : v));
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

export async function saveBrandKit(patch: Partial<Omit<BrandKit, "id">>): Promise<BrandKit> {
  await wait();
  const next = brandKitSchema.safeParse({ ...(KIT ?? { ...INITIAL_KIT, id: "bk_new", logoUrl: null }), ...patch });
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

const INITIAL_SETTINGS: Settings = {
  language: "en",
  aspectRatio: "9:16",
  captionTemplateId: "hormozi",
  autoplay: true,
  haptics: true,
  wifiOnlyUploads: false,
  push: { renderFinished: true, postPublished: true },
  email: { weeklySummary: true, productUpdates: false },
};
let SETTINGS = INITIAL_SETTINGS;

export async function getSettings(): Promise<Settings> {
  await respond("settings");
  return settingsSchema.parse(SETTINGS);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  await wait();
  SETTINGS = settingsSchema.parse({ ...SETTINGS, ...patch });
  return SETTINGS;
}

export function resetAccountMocks() {
  ACCOUNT = STUDIO;
  CLONES = INITIAL_CLONES;
  KIT = INITIAL_KIT;
  NOTIFICATIONS = INITIAL_NOTIFICATIONS;
  SETTINGS = INITIAL_SETTINGS;
}
