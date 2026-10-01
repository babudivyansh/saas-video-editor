// Every screen in design/SCREENS.md: its route, title, design file and the
// links the design draws out of it (extracted from design/screens/*.html).
// Phase 3 renders each one as a placeholder from this table; later phases
// replace placeholders one section at a time and keep this file as the map.

export type ScreenId =
  | "Main" | "E-Welcome" | "E-Generate" | "E-Create" | "E-Grow"
  | "E-Login" | "E-Signup" | "E-OTP" | "E-Forgot"
  | "BN-Home" | "BN-Tools" | "BN-Assistant"
  | "BN-CreateHub" | "BN-Create" | "BN-AIMedia"
  | "BN-Editor" | "BN-EdMedia" | "BN-EdCaptions" | "BN-EdAudio" | "BN-EdText" | "BN-EdEffects" | "BN-EdAI" | "BN-EdExport"
  | "BN-Projects" | "BN-Drafts" | "BN-Shorts" | "BN-Insights"
  | "BN-Assets" | "BN-AssetsAudio" | "BN-AssetsAI"
  | "BN-InsOverview" | "BN-InsContent" | "BN-InsPlatform"
  | "BN-Social" | "BN-SocialAudience" | "BN-SocialCompetitors" | "BN-SocialReports"
  | "BN-Accounts" | "BN-Calendar" | "BN-Composer" | "BN-Scheduled"
  | "BN-Profile" | "BN-Voices" | "BN-BrandKit" | "BN-Credits" | "BN-Subscription"
  | "BN-Notifications" | "BN-Settings" | "BN-Help" | "BN-Legal";

export type Section =
  | "Launch" | "Authentication" | "Home" | "Create" | "Editor" | "Projects"
  | "Assets" | "Insights" | "Social Studio" | "You";

export type Link = {
  to: ScreenId;
  label: string;
  /** Replace the current screen in its stack instead of pushing (e.g. switching editor panels). */
  replace?: boolean;
  /**
   * Sign in / out instead of navigating. The root layout's protected routes
   * then move the user (OTP → Home, Log out → Splash) and drop the history
   * behind them, so Android back can't return to auth or onboarding.
   */
  session?: "signIn" | "signOut";
};

export type ScreenDef = {
  title: string;
  section: Section;
  /** Concrete URL to open this screen (dynamic segments filled with a sample). */
  href: string;
  /** Route file under src/app that serves it. */
  file: string;
  /** Where the back button goes when there is no history (deep link, cold start). */
  back?: ScreenId;
  links: Link[];
};

/** Sample id for the dynamic project route until real data arrives (Phase 7–8). */
export const SAMPLE_PROJECT_ID = "founders-pod-ep-42";

export const SCREENS: Record<ScreenId, ScreenDef> = {
  // ── Launch ─────────────────────────────────────────────────────────────
  Main: { title: "Splash", section: "Launch", href: "/", file: "index.tsx", links: [{ to: "E-Welcome", label: "Get started", replace: true }] },
  "E-Welcome": { title: "Welcome", section: "Launch", href: "/onboarding/welcome", file: "onboarding/welcome.tsx", links: [{ to: "E-Generate", label: "Next" }, { to: "E-Login", label: "Skip" }] },
  "E-Generate": { title: "Generate", section: "Launch", href: "/onboarding/generate", file: "onboarding/generate.tsx", back: "E-Welcome", links: [{ to: "E-Create", label: "Next" }, { to: "E-Login", label: "Skip" }] },
  "E-Create": { title: "Create", section: "Launch", href: "/onboarding/create", file: "onboarding/create.tsx", back: "E-Generate", links: [{ to: "E-Grow", label: "Next" }, { to: "E-Login", label: "Skip" }] },
  "E-Grow": { title: "Grow", section: "Launch", href: "/onboarding/grow", file: "onboarding/grow.tsx", back: "E-Create", links: [{ to: "E-Login", label: "Get started" }] },

  // ── Authentication ─────────────────────────────────────────────────────
  "E-Login": { title: "Log in", section: "Authentication", href: "/login", file: "(auth)/login.tsx", back: "E-Grow", links: [{ to: "E-OTP", label: "Log in" }, { to: "E-Forgot", label: "Forgot password?" }, { to: "E-Signup", label: "Create an account" }] },
  "E-Signup": { title: "Sign up", section: "Authentication", href: "/sign-up", file: "(auth)/sign-up.tsx", back: "E-Login", links: [{ to: "E-OTP", label: "Create account" }, { to: "E-Login", label: "Log in" }] },
  "E-OTP": { title: "Verify your email", section: "Authentication", href: "/otp", file: "(auth)/otp.tsx", back: "E-Login", links: [{ to: "BN-Home", label: "Verify", session: "signIn" }, { to: "E-Signup", label: "Change email" }] },
  "E-Forgot": { title: "Forgot password", section: "Authentication", href: "/forgot-password", file: "(auth)/forgot-password.tsx", back: "E-Login", links: [{ to: "E-OTP", label: "Send reset link" }, { to: "E-Login", label: "Back to log in" }] },

  // ── Home tab ───────────────────────────────────────────────────────────
  "BN-Home": { title: "Home", section: "Home", href: "/home", file: "(tabs)/home/index.tsx", links: [{ to: "BN-Create", label: "Start AutoClipping" }, { to: "BN-Assistant", label: "Ask AI" }, { to: "BN-Notifications", label: "Notifications" }, { to: "BN-Credits", label: "Top up" }, { to: "BN-Insights", label: "My clips" }, { to: "BN-Tools", label: "All tools" }, { to: "BN-Editor", label: "Open the editor" }] },
  "BN-Tools": { title: "Tools", section: "Home", href: "/home/recommended-tools", file: "(tabs)/home/recommended-tools.tsx", back: "BN-Home", links: [{ to: "BN-Create", label: "AutoClip" }, { to: "BN-Editor", label: "Editor" }, { to: "BN-AIMedia", label: "AI image generator" }] },
  "BN-Assistant": { title: "Clipiro AI", section: "Home", href: "/assistant", file: "assistant.tsx", back: "BN-Home", links: [{ to: "BN-Insights", label: "Review clips" }, { to: "BN-Credits", label: "1,000 min" }] },

  // ── Create tab ─────────────────────────────────────────────────────────
  "BN-CreateHub": { title: "Create", section: "Create", href: "/create", file: "(tabs)/create/index.tsx", links: [{ to: "BN-Create", label: "AutoClip" }, { to: "BN-Assets", label: "From Assets" }, { to: "BN-Editor", label: "Editor" }, { to: "BN-AIMedia", label: "AI Media" }, { to: "BN-Tools", label: "All tools" }, { to: "BN-Credits", label: "1,000 min" }] },
  "BN-Create": { title: "AutoClip", section: "Create", href: "/create/autoclip", file: "(tabs)/create/autoclip.tsx", back: "BN-CreateHub", links: [{ to: "BN-Credits", label: "1,000 min" }] },
  "BN-AIMedia": { title: "AI Media", section: "Create", href: "/create/ai-media", file: "(tabs)/create/ai-media.tsx", back: "BN-CreateHub", links: [{ to: "BN-AssetsAI", label: "Saved to Assets" }, { to: "BN-Credits", label: "1,000 min" }] },

  // ── Editor (full-screen modal; panels are bottom sheets over it) ───────
  "BN-Editor": { title: "Editor", section: "Editor", href: "/editor", file: "editor/index.tsx", back: "BN-Home", links: [{ to: "BN-EdMedia", label: "Media" }, { to: "BN-EdText", label: "Text" }, { to: "BN-EdCaptions", label: "Captions" }, { to: "BN-EdAudio", label: "Audio" }, { to: "BN-EdEffects", label: "Effects" }, { to: "BN-EdAI", label: "AI Tools" }, { to: "BN-EdExport", label: "Export" }] },
  "BN-EdMedia": { title: "Media", section: "Editor", href: "/editor/media", file: "editor/media.tsx", back: "BN-Editor", links: [{ to: "BN-EdExport", label: "Export" }] },
  "BN-EdCaptions": { title: "Captions", section: "Editor", href: "/editor/captions", file: "editor/captions.tsx", back: "BN-Editor", links: [{ to: "BN-EdExport", label: "Export" }] },
  "BN-EdAudio": { title: "Audio", section: "Editor", href: "/editor/audio", file: "editor/audio.tsx", back: "BN-Editor", links: [{ to: "BN-EdExport", label: "Export" }] },
  "BN-EdText": { title: "Text", section: "Editor", href: "/editor/text", file: "editor/text.tsx", back: "BN-Editor", links: [{ to: "BN-EdExport", label: "Export" }] },
  "BN-EdEffects": { title: "Effects", section: "Editor", href: "/editor/effects", file: "editor/effects.tsx", back: "BN-Editor", links: [{ to: "BN-EdExport", label: "Export" }] },
  "BN-EdAI": { title: "AI Tools", section: "Editor", href: "/editor/ai-tools", file: "editor/ai-tools.tsx", back: "BN-Editor", links: [{ to: "BN-EdExport", label: "Export" }] },
  "BN-EdExport": { title: "Export", section: "Editor", href: "/editor/export", file: "editor/export.tsx", back: "BN-Editor", links: [{ to: "BN-Composer", label: "Post" }] },

  // ── Projects tab ───────────────────────────────────────────────────────
  "BN-Projects": { title: "Projects", section: "Projects", href: "/projects", file: "(tabs)/projects/index.tsx", links: [{ to: "BN-Drafts", label: "Drafts" }, { to: "BN-Shorts", label: "Videos · Reels · Shorts" }, { to: "BN-Insights", label: "Founders Pod · Ep. 42" }, { to: "BN-Editor", label: "Continue editing" }, { to: "BN-Assets", label: "Assets" }] },
  "BN-Drafts": { title: "Drafts", section: "Projects", href: "/projects/drafts", file: "(tabs)/projects/drafts.tsx", back: "BN-Projects", links: [{ to: "BN-Editor", label: "Resume" }, { to: "BN-Shorts", label: "Shorts" }] },
  "BN-Shorts": { title: "Videos · Reels · Shorts", section: "Projects", href: "/projects/videos-reels-shorts", file: "(tabs)/projects/videos-reels-shorts.tsx", back: "BN-Projects", links: [{ to: "BN-Drafts", label: "Drafts" }] },
  "BN-Insights": { title: "Founders Pod · Ep. 42", section: "Projects", href: `/projects/${SAMPLE_PROJECT_ID}`, file: "(tabs)/projects/[projectId].tsx", back: "BN-Projects", links: [{ to: "BN-Editor", label: "Edit clip" }] },

  // ── Assets (inside the Projects tab — the designs highlight Projects) ──
  "BN-Assets": { title: "Assets", section: "Assets", href: "/projects/assets", file: "(tabs)/projects/assets/index.tsx", back: "BN-Projects", links: [{ to: "BN-AssetsAudio", label: "Audio" }, { to: "BN-AssetsAI", label: "AI Assets" }] },
  "BN-AssetsAudio": { title: "Audio", section: "Assets", href: "/projects/assets/audio", file: "(tabs)/projects/assets/audio.tsx", back: "BN-Assets", links: [{ to: "BN-Assets", label: "All" }, { to: "BN-AssetsAI", label: "AI Assets" }] },
  "BN-AssetsAI": { title: "AI Assets", section: "Assets", href: "/projects/assets/ai-assets", file: "(tabs)/projects/assets/ai-assets.tsx", back: "BN-Assets", links: [{ to: "BN-AIMedia", label: "Generate" }, { to: "BN-Voices", label: "My voices" }, { to: "BN-Assets", label: "All" }, { to: "BN-AssetsAudio", label: "Audio" }] },

  // ── Social tab: Social Studio ──────────────────────────────────────────
  "BN-Accounts": { title: "Social Studio", section: "Social Studio", href: "/social", file: "(tabs)/social/index.tsx", links: [{ to: "BN-Calendar", label: "Calendar" }, { to: "BN-Scheduled", label: "Scheduled" }, { to: "BN-Composer", label: "New post" }, { to: "BN-Social", label: "Analytics" }, { to: "BN-InsPlatform", label: "Insights" }] },
  "BN-Calendar": { title: "Content calendar", section: "Social Studio", href: "/social/content-calendar", file: "(tabs)/social/content-calendar.tsx", back: "BN-Accounts", links: [{ to: "BN-Composer", label: "New post" }, { to: "BN-Scheduled", label: "Scheduled" }, { to: "BN-Social", label: "Analytics" }] },
  "BN-Scheduled": { title: "Scheduled posts", section: "Social Studio", href: "/social/scheduled-posts", file: "(tabs)/social/scheduled-posts.tsx", back: "BN-Accounts", links: [{ to: "BN-Composer", label: "New post" }, { to: "BN-Calendar", label: "Calendar" }, { to: "BN-Social", label: "Analytics" }] },
  "BN-Composer": { title: "New post", section: "Social Studio", href: "/composer", file: "composer.tsx", back: "BN-Calendar", links: [{ to: "BN-Shorts", label: "Change clip" }, { to: "BN-Scheduled", label: "Schedule post" }, { to: "BN-Calendar", label: "Calendar" }] },

  // ── Social tab: Insights ───────────────────────────────────────────────
  "BN-InsOverview": { title: "Insights", section: "Insights", href: "/social/insights", file: "(tabs)/social/insights/index.tsx", back: "BN-Accounts", links: [{ to: "BN-InsContent", label: "Content" }, { to: "BN-InsPlatform", label: "Platforms" }] },
  "BN-InsContent": { title: "Content performance", section: "Insights", href: "/social/insights/content-performance", file: "(tabs)/social/insights/content-performance.tsx", back: "BN-InsOverview", links: [{ to: "BN-InsOverview", label: "Overview" }, { to: "BN-InsPlatform", label: "Platforms" }] },
  "BN-InsPlatform": { title: "Platform analytics", section: "Insights", href: "/social/insights/platform-analytics", file: "(tabs)/social/insights/platform-analytics.tsx", back: "BN-InsOverview", links: [{ to: "BN-InsOverview", label: "Overview" }, { to: "BN-InsContent", label: "Content" }] },
  "BN-Social": { title: "Analytics", section: "Insights", href: "/social/insights/account-analytics", file: "(tabs)/social/insights/account-analytics/index.tsx", back: "BN-Accounts", links: [{ to: "BN-InsContent", label: "Content" }, { to: "BN-SocialAudience", label: "Audience" }, { to: "BN-SocialCompetitors", label: "Competitors" }, { to: "BN-SocialReports", label: "Reports" }] },
  "BN-SocialAudience": { title: "Audience", section: "Insights", href: "/social/insights/account-analytics/audience", file: "(tabs)/social/insights/account-analytics/audience.tsx", back: "BN-Social", links: [{ to: "BN-Social", label: "Overview" }, { to: "BN-SocialCompetitors", label: "Competitors" }, { to: "BN-SocialReports", label: "Reports" }] },
  "BN-SocialCompetitors": { title: "Competitors", section: "Insights", href: "/social/insights/account-analytics/competitors", file: "(tabs)/social/insights/account-analytics/competitors.tsx", back: "BN-Social", links: [{ to: "BN-Social", label: "Overview" }, { to: "BN-SocialAudience", label: "Audience" }, { to: "BN-SocialReports", label: "Reports" }] },
  "BN-SocialReports": { title: "Reports", section: "Insights", href: "/social/insights/account-analytics/reports", file: "(tabs)/social/insights/account-analytics/reports.tsx", back: "BN-Social", links: [{ to: "BN-Social", label: "Overview" }, { to: "BN-SocialAudience", label: "Audience" }, { to: "BN-SocialCompetitors", label: "Competitors" }] },

  // ── You tab ────────────────────────────────────────────────────────────
  "BN-Profile": { title: "You", section: "You", href: "/you", file: "(tabs)/you/index.tsx", links: [{ to: "BN-Voices", label: "My Voices" }, { to: "BN-Assets", label: "My Assets" }, { to: "BN-BrandKit", label: "Brand Kit" }, { to: "BN-Credits", label: "Credits" }, { to: "BN-Subscription", label: "Subscription" }, { to: "BN-Notifications", label: "Notifications" }, { to: "BN-Settings", label: "Settings" }, { to: "BN-Help", label: "Help & Support" }, { to: "BN-Legal", label: "Legal" }, { to: "Main", label: "Log out", session: "signOut" }] },
  "BN-Voices": { title: "My Voices", section: "You", href: "/you/my-voices", file: "(tabs)/you/my-voices.tsx", back: "BN-Profile", links: [{ to: "BN-AIMedia", label: "Use in voiceover" }] },
  "BN-BrandKit": { title: "Brand Kit", section: "You", href: "/you/brand-kit", file: "(tabs)/you/brand-kit.tsx", back: "BN-Profile", links: [] },
  "BN-Credits": { title: "Credits", section: "You", href: "/you/credits", file: "(tabs)/you/credits.tsx", back: "BN-Profile", links: [] },
  "BN-Subscription": { title: "Subscription", section: "You", href: "/you/subscription", file: "(tabs)/you/subscription.tsx", back: "BN-Profile", links: [] },
  "BN-Notifications": { title: "Notifications", section: "You", href: "/you/notifications", file: "(tabs)/you/notifications.tsx", back: "BN-Profile", links: [{ to: "BN-Settings", label: "Notification settings" }] },
  "BN-Settings": { title: "Settings", section: "You", href: "/you/settings", file: "(tabs)/you/settings.tsx", back: "BN-Profile", links: [] },
  "BN-Help": { title: "Help & Support", section: "You", href: "/you/help-support", file: "(tabs)/you/help-support.tsx", back: "BN-Profile", links: [] },
  "BN-Legal": { title: "Legal", section: "You", href: "/you/legal", file: "(tabs)/you/legal.tsx", back: "BN-Profile", links: [] },
};

// Editor panels link to each other through the panel tab strip (design:
// BN-Ed*.html), plus Export. Generated so the six stay in step.
const PANELS: ScreenId[] = ["BN-EdMedia", "BN-EdCaptions", "BN-EdAudio", "BN-EdText", "BN-EdEffects", "BN-EdAI"];
for (const p of PANELS) {
  SCREENS[p].links = [
    ...PANELS.filter((o) => o !== p).map((o) => ({ to: o, label: SCREENS[o].title, replace: true })),
    { to: "BN-EdExport", label: "Export" },
  ];
}

export const SCREEN_IDS = Object.keys(SCREENS) as ScreenId[];

/** Tab roots show no back button and are the tab bar's destinations. */
export const TAB_ROOTS: ScreenId[] = ["BN-Home", "BN-Projects", "BN-CreateHub", "BN-Accounts", "BN-Profile"];
