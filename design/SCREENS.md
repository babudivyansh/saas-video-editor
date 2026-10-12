# Clipiro Android — screen list

Each screen: `design/screens/<file>.html` (open in a browser, 412px wide) and `design/png/<file>.png` (rendered from that HTML with Geist).
**`design/screens/` is the source of truth.** `design/source/*.dc.html` is the original design-canvas export and is NOT updated by the 2026-10-01 revision (see "Revisions" below).
Heights over 915px are scrolling screens.

| # | Section | Screen | File | Suggested route | Height |
|---|---|---|---|---|---|
| 1 | Launch · Splash & onboarding | Splash | Main | `/` | 915 |
| 2 | Launch · Splash & onboarding | Welcome | E-Welcome | `/(onboarding)/welcome` | 915 |
| 3 | Launch · Splash & onboarding | Generate | E-Generate | `/(onboarding)/generate` | 915 |
| 4 | Launch · Splash & onboarding | Create | E-Create | `/(onboarding)/create` | 915 |
| 5 | Launch · Splash & onboarding | Grow | E-Grow | `/(onboarding)/grow` | 915 |
| 6 | Authentication | Login | E-Login | `/(auth)/login` | 915 |
| 7 | Authentication | Sign up | E-Signup | `/(auth)/sign-up` | 915 |
| 8 | Authentication | OTP (6 digits) | E-OTP | `/(auth)/otp` | 915 |
| 9 | Authentication | Forgot password | E-Forgot | `/(auth)/forgot-password` | 915 |
| 10 | Home | Dashboard | BN-Home | `/home` | 1298 |
| 11 | Home | Recommended tools | BN-Tools | `/home/recommended-tools` | 1391 |
| 12 | Home | AI Assistant | BN-Assistant | `/home/ai-assistant` | 915 |
| 13 | Create | Create hub | BN-CreateHub | `/create` | 992 |
| 14 | Create | AutoClip | BN-Create | `/create/autoclip` | 915 |
| 15 | Create | AI Media | BN-AIMedia | `/create/ai-media` | 915 |
| 16 | Editor | Timeline | BN-Editor | `/editor` | 915 |
| 17 | Editor | Media (new) | BN-EdMedia | `/editor/media` | 915 |
| 18 | Editor | Captions | BN-EdCaptions | `/editor/captions` | 915 |
| 19 | Editor | Audio | BN-EdAudio | `/editor/audio` | 915 |
| 20 | Editor | Text | BN-EdText | `/editor/text` | 915 |
| 21 | Editor | Effects · Filters · Transitions | BN-EdEffects | `/editor/effects` | 915 |
| 22 | Editor | AI Tools | BN-EdAI | `/editor/ai-tools` | 915 |
| 23 | Editor | Export | BN-EdExport | `/editor/export` | 915 |
| 24 | Projects | All | BN-Projects | `/projects` | 1041 |
| 25 | Projects | Drafts | BN-Drafts | `/projects/drafts` | 915 |
| 26 | Projects | Videos · Reels · Shorts | BN-Shorts | `/projects/videos-reels-shorts` | 915 |
| 27 | Projects | Project detail | BN-Insights | `/projects/project-detail` | 1006 |
| 28 | Assets | All · Videos · Images | BN-Assets | `/assets` | 1046 |
| 29 | Assets | Audio | BN-AssetsAudio | `/assets/audio` | 915 |
| 30 | Assets | AI Assets | BN-AssetsAI | `/assets/ai-assets` | 1000 |
| 31 | Insights | Overview | BN-InsOverview | `/insights` | 931 |
| 32 | Insights | Content performance | BN-InsContent | `/insights/content-performance` | 975 |
| 33 | Insights | Platform analytics | BN-InsPlatform | `/insights/platform-analytics` | 1081 |
| 34 | Insights | Account analytics · Overview | BN-Social | `/insights/account-analytics` | 1120 |
| 35 | Insights | Account analytics · Audience (new) | BN-SocialAudience | `/insights/account-analytics/audience` | 1480 |
| 36 | Insights | Account analytics · Competitors (new) | BN-SocialCompetitors | `/insights/account-analytics/competitors` | 1039 |
| 37 | Insights | Account analytics · Reports (new) | BN-SocialReports | `/insights/account-analytics/reports` | 1123 |
| 38 | Social Studio | Accounts | BN-Accounts | `/social-studio` | 915 |
| 39 | Social Studio | Content calendar | BN-Calendar | `/social-studio/content-calendar` | 915 |
| 40 | Social Studio | Composer | BN-Composer | `/social-studio/composer` | 915 |
| 41 | Social Studio | Scheduled posts | BN-Scheduled | `/social-studio/scheduled-posts` | 915 |
| 42 | You | Profile | BN-Profile | `/you` | 1231 |
| 43 | You | My Voices | BN-Voices | `/you/my-voices` | 915 |
| 44 | You | Brand Kit | BN-BrandKit | `/you/brand-kit` | 915 |
| 45 | You | Credits | BN-Credits | `/you/credits` | 1095 |
| 46 | You | Subscription | BN-Subscription | `/you/subscription` | 1267 |
| 47 | You | Notifications | BN-Notifications | `/you/notifications` | 915 |
| 48 | You | Settings | BN-Settings | `/you/settings` | 1296 |
| 49 | You | Help & Support | BN-Help | `/you/help-support` | 915 |
| 50 | You | Legal | BN-Legal | `/you/legal` | 915 |

## Navigation
- Tabs (floating pill bar): Home · Projects · Create (centre, emerald) · Social · You
- Stack: splash → onboarding (4) → login / sign-up → OTP → Home
- Full-screen modals: Editor + its panels (bottom sheets: Media, Captions, Audio, Text, Effects, AI Tools), Export, Composer, AI Assistant
- Assets reached from Projects header and Create hub; Insights from Home and Social Studio

## Data each area needs (from clipiro.com)
- Home: clip count, active projects, clip minutes, AI credits, creator level/XP, recent clips, tools
- AutoClip: upload (MP4/MOV/WebM; size and length limits depend on the plan: Free 250 MB/30 min … Studio 5 GB/6 h) or link, clip length (<30s/15–60s/60s+), count, aspect ratio, caption style, advanced; cost = 1 Clip Minute per video minute
- Clips: virality score, rank, length, format, status (Ready/Rendering/Failed), starred
- Assets: storage used/limit, folders, type, size, length, favourites, archive
- Social tracker: YouTube / Instagram / Facebook accounts + health, followers, views, engagement, interactions, audience (age, gender, country, city, active hours), up to 3 competitors (Instagram/YouTube), reports (PDF/CSV/XLSX, scheduled) and share links, weekly AI summary (5 credits)
- Plans: Free $0 / Creator $15 / Pro $29 / Studio $59 per month; credit packs 30/100/280/640; minute packs 100/300/1000
- NEW (not on web yet): post scheduling/composer (YouTube first), voice cloning (needs a paid ElevenLabs plan), push notifications, draft progress

## Revisions (2026-10-01)
- **Removed** (products no longer offered): Text to Video, Script to Video, AI Avatar, Image to Video, Split Screen, My Avatars. Create hub now shows Editor + AI Media and a row of AI tools that exist today.
- **TikTok removed everywhere** (not available in India). Platforms are YouTube, Instagram and Facebook — the ones the backend supports. X and LinkedIn removed from "Connect more" (now "Add another account").
- **Publishing:** v1 posts to YouTube Shorts; Instagram Reels and Facebook show "Soon" in the composer. Calendar/scheduled examples use Shorts.
- **Billing:** no Razorpay/UPI checkout in the app (Google Play policy). Credits and Subscription show plans, packs and balances read-only with a "coming soon" note until Phase 12 (Play Billing).
- **AutoClip limits** come from the user's plan (`/api/upload-policy`); the design shows the Studio limits (5 GB, 6 h).
- **OTP** is 6 digits (the design already had 6 boxes; the sample is mid-entry).
- **Drafts progress** = editing checklist (media, trim, captions, audio, text; 20% each), computed server-side — new backend work (see docs/mobile/ARCHITECTURE.md).
- **Legal** shows real dates from `app/legal/documents.ts`; "Commercial license" became Affiliate Terms (commercial use is covered by the Terms).
- **Editor toolbar:** Media opens the new Media sheet (Assets / Upload / Stock); Filters and Transitions open the Effects panel on that tab; the old Image button (merged into Media) is now AI Tools. The panel tab strip gained Media.
- **New:** Account analytics Audience, Competitors and Reports tabs; the Overview tab pills now link to them.
