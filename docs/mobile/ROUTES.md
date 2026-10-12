# Clipiro Android — routes

Generated from `apps/mobile/src/navigation/screens.ts` (Phase 3, 2026-10-01). Every route currently
renders a placeholder naming its design file; Phase 4 replaces them section by section.

**Status key:** `placeholder` = route, title, back behaviour and design links work; screen UI not built yet.

| # | Section | Screen | Design file | Route | Presented as | Status |
|---|---|---|---|---|---|---|
| 1 | Launch | Splash | Main | `/` | root (signed out) | placeholder |
| 2 | Launch | Welcome | E-Welcome | `/onboarding/welcome` | onboarding stack (signed out) | placeholder |
| 3 | Launch | Generate | E-Generate | `/onboarding/generate` | onboarding stack (signed out) | placeholder |
| 4 | Launch | Create | E-Create | `/onboarding/create` | onboarding stack (signed out) | placeholder |
| 5 | Launch | Grow | E-Grow | `/onboarding/grow` | onboarding stack (signed out) | placeholder |
| 6 | Authentication | Log in | E-Login | `/login` | auth stack (signed out) | placeholder |
| 7 | Authentication | Sign up | E-Signup | `/sign-up` | auth stack (signed out) | placeholder |
| 8 | Authentication | Verify your email | E-OTP | `/otp` | auth stack (signed out) | placeholder |
| 9 | Authentication | Forgot password | E-Forgot | `/forgot-password` | auth stack (signed out) | placeholder |
| 10 | Home | Home | BN-Home | `/home` | home tab | placeholder |
| 11 | Home | Tools | BN-Tools | `/home/recommended-tools` | home tab | placeholder |
| 12 | Home | Clipiro AI | BN-Assistant | `/assistant` | full-screen modal | placeholder |
| 13 | Create | Create | BN-CreateHub | `/create` | create tab | placeholder |
| 14 | Create | AutoClip | BN-Create | `/create/autoclip` | create tab | placeholder |
| 15 | Create | AI Media | BN-AIMedia | `/create/ai-media` | create tab | placeholder |
| 16 | Editor | Editor | BN-Editor | `/editor` | full-screen modal | placeholder |
| 17 | Editor | Media | BN-EdMedia | `/editor/media` | bottom sheet over editor | placeholder |
| 18 | Editor | Captions | BN-EdCaptions | `/editor/captions` | bottom sheet over editor | placeholder |
| 19 | Editor | Audio | BN-EdAudio | `/editor/audio` | bottom sheet over editor | placeholder |
| 20 | Editor | Text | BN-EdText | `/editor/text` | bottom sheet over editor | placeholder |
| 21 | Editor | Effects | BN-EdEffects | `/editor/effects` | bottom sheet over editor | placeholder |
| 22 | Editor | AI Tools | BN-EdAI | `/editor/ai-tools` | bottom sheet over editor | placeholder |
| 23 | Editor | Export | BN-EdExport | `/editor/export` | modal over editor | placeholder |
| 24 | Projects | Projects | BN-Projects | `/projects` | projects tab | placeholder |
| 25 | Projects | Drafts | BN-Drafts | `/projects/drafts` | projects tab | placeholder |
| 26 | Projects | Videos · Reels · Shorts | BN-Shorts | `/projects/videos-reels-shorts` | projects tab | placeholder |
| 27 | Projects | Founders Pod · Ep. 42 | BN-Insights | `/projects/[projectId]` | projects tab | placeholder |
| 28 | Assets | Assets | BN-Assets | `/projects/assets` | projects tab | placeholder |
| 29 | Assets | Audio | BN-AssetsAudio | `/projects/assets/audio` | projects tab | placeholder |
| 30 | Assets | AI Assets | BN-AssetsAI | `/projects/assets/ai-assets` | projects tab | placeholder |
| 31 | Social Studio | Social Studio | BN-Accounts | `/social` | social tab | placeholder |
| 32 | Social Studio | Content calendar | BN-Calendar | `/social/content-calendar` | social tab | placeholder |
| 33 | Social Studio | Scheduled posts | BN-Scheduled | `/social/scheduled-posts` | social tab | placeholder |
| 34 | Social Studio | New post | BN-Composer | `/composer` | full-screen modal | placeholder |
| 35 | Insights | Insights | BN-InsOverview | `/social/insights` | social tab | placeholder |
| 36 | Insights | Content performance | BN-InsContent | `/social/insights/content-performance` | social tab | placeholder |
| 37 | Insights | Platform analytics | BN-InsPlatform | `/social/insights/platform-analytics` | social tab | placeholder |
| 38 | Insights | Analytics | BN-Social | `/social/insights/account-analytics` | social tab | placeholder |
| 39 | Insights | Audience | BN-SocialAudience | `/social/insights/account-analytics/audience` | social tab | placeholder |
| 40 | Insights | Competitors | BN-SocialCompetitors | `/social/insights/account-analytics/competitors` | social tab | placeholder |
| 41 | Insights | Reports | BN-SocialReports | `/social/insights/account-analytics/reports` | social tab | placeholder |
| 42 | You | You | BN-Profile | `/you` | you tab | placeholder |
| 43 | You | My Voices | BN-Voices | `/you/my-voices` | you tab | placeholder |
| 44 | You | Brand Kit | BN-BrandKit | `/you/brand-kit` | you tab | placeholder |
| 45 | You | Credits | BN-Credits | `/you/credits` | you tab | placeholder |
| 46 | You | Subscription | BN-Subscription | `/you/subscription` | you tab | placeholder |
| 47 | You | Notifications | BN-Notifications | `/you/notifications` | you tab | placeholder |
| 48 | You | Settings | BN-Settings | `/you/settings` | you tab | placeholder |
| 49 | You | Help & Support | BN-Help | `/you/help-support` | you tab | placeholder |
| 50 | You | Legal | BN-Legal | `/you/legal` | you tab | placeholder |

## Navigation rules
- **Signed out:** Splash, onboarding (`/onboarding/*`) and auth are reachable; the tabs and modals are not.
  **Signed in:** only the tabs and modals. Switching sides drops the other side's history
  (Expo Router `Stack.Protected`), so Android back can't return to auth after OTP, or to the app after Log out.
  The flag is temporary (`src/state/session.ts`); Phase 6 replaces it with real tokens.
- **Tabs:** each tab is its own stack and keeps its history. Re-pressing the active tab pops to its root.
  Android back on another tab's root returns to Home; back on Home leaves the app.
- **Assets** lives in the Projects tab and **Insights** in the Social tab — the tabs the designs highlight on those screens.
- **Editor panels** are native bottom sheets (60% / 95%) over the editor; switching panels replaces the sheet.
- Onboarding routes are under `/onboarding/` because its "Create" step would otherwise collide with the Create tab (`/create`).
