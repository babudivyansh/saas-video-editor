# Clipiro Android — routes

Generated from `apps/mobile/src/navigation/screens.ts` and the route files. Phase 3 (2026-10-01) gave every
route a placeholder naming its design file; Phase 4 replaces them section by section.

**Status key:** `built` = the designed screen, on mock data until the API phases; `placeholder` = route, title,
back behaviour and design links work, screen UI not built yet.

| # | Section | Screen | Design file | Route | Presented as | Status |
|---|---|---|---|---|---|---|
| 1 | Launch | Splash | Main | `/` | root (signed out) | built |
| 2 | Launch | Welcome | E-Welcome | `/onboarding/welcome` | onboarding stack (signed out) | built |
| 3 | Launch | Generate | E-Generate | `/onboarding/generate` | onboarding stack (signed out) | built |
| 4 | Launch | Create | E-Create | `/onboarding/create` | onboarding stack (signed out) | built |
| 5 | Launch | Grow | E-Grow | `/onboarding/grow` | onboarding stack (signed out) | built |
| 6 | Authentication | Log in | E-Login | `/login` | auth stack (signed out) | built |
| 7 | Authentication | Sign up | E-Signup | `/sign-up` | auth stack (signed out) | built |
| 8 | Authentication | Verify your email | E-OTP | `/otp` | auth stack (signed out) | built |
| 9 | Authentication | Forgot password | E-Forgot | `/forgot-password` | auth stack (signed out) | built |
| 10 | Home | Home | BN-Home | `/home` | home tab | built |
| 11 | Home | Tools | BN-Tools | `/home/recommended-tools` | home tab | built |
| 12 | Home | Clipiro AI | BN-Assistant | `/assistant` | full-screen modal | built |
| 13 | Create | Create | BN-CreateHub | `/create` | create tab | built |
| 14 | Create | AutoClip | BN-Create | `/create/autoclip` | create tab | built |
| 15 | Create | AI Media | BN-AIMedia | `/create/ai-media` | create tab | built |
| 16 | Editor | Editor | BN-Editor | `/editor` | full-screen modal | built |
| 17 | Editor | Media | BN-EdMedia | `/editor/media` | editor panel (switches in place) | built |
| 18 | Editor | Captions | BN-EdCaptions | `/editor/captions` | editor panel (switches in place) | built |
| 19 | Editor | Audio | BN-EdAudio | `/editor/audio` | editor panel (switches in place) | built |
| 20 | Editor | Text | BN-EdText | `/editor/text` | editor panel (switches in place) | built |
| 21 | Editor | Effects | BN-EdEffects | `/editor/effects` | editor panel (switches in place) | built |
| 22 | Editor | AI Tools | BN-EdAI | `/editor/ai-tools` | editor panel (switches in place) | built |
| 23 | Editor | Export | BN-EdExport | `/editor/export` | modal over editor | built |
| 24 | Projects | Projects | BN-Projects | `/projects` | projects tab | built |
| 25 | Projects | Drafts | BN-Drafts | `/projects/drafts` | projects tab | built |
| 26 | Projects | Videos · Reels · Shorts | BN-Shorts | `/projects/videos-reels-shorts` | projects tab | built |
| 27 | Projects | Founders Pod · Ep. 42 | BN-Insights | `/projects/[projectId]` | projects tab | built |
| 28 | Assets | Assets | BN-Assets | `/projects/assets` | projects tab | built |
| 29 | Assets | Audio | BN-AssetsAudio | `/projects/assets/audio` | projects tab | built |
| 30 | Assets | AI Assets | BN-AssetsAI | `/projects/assets/ai-assets` | projects tab | built |
| 31 | Social Studio | Social Studio | BN-Accounts | `/social` | social tab | placeholder |
| 32 | Social Studio | Content calendar | BN-Calendar | `/social/content-calendar` | social tab | placeholder |
| 33 | Social Studio | Scheduled posts | BN-Scheduled | `/social/scheduled-posts` | social tab | placeholder |
| 34 | Social Studio | New post | BN-Composer | `/composer` | full-screen modal | placeholder |
| 35 | Insights | Insights | BN-InsOverview | `/social/insights` | social tab | built |
| 36 | Insights | Content performance | BN-InsContent | `/social/insights/content-performance` | social tab | built |
| 37 | Insights | Platform analytics | BN-InsPlatform | `/social/insights/platform-analytics` | social tab | built |
| 38 | Insights | Analytics | BN-Social | `/social/insights/account-analytics` | social tab | built |
| 39 | Insights | Audience | BN-SocialAudience | `/social/insights/account-analytics/audience` | social tab | built |
| 40 | Insights | Competitors | BN-SocialCompetitors | `/social/insights/account-analytics/competitors` | social tab | built |
| 41 | Insights | Reports | BN-SocialReports | `/social/insights/account-analytics/reports` | social tab | built |
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
- **Editor panels** are the editor in "panel mode" (compact preview + panel), as the designs draw them. Each panel
  is its own route shown without a transition; its tab strip switches panels in place (`router.replace`), so
  Android back always returns to the timeline. AI Media hides the tab bar (it has its own action bar).
- Onboarding routes are under `/onboarding/` because its "Create" step would otherwise collide with the Create tab (`/create`).
