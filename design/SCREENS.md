# Clipiro Android — screen list

Each screen: `design/screens/<file>.html` (open in a browser, 412px wide), `design/png/<file>.png` (render), `design/source/<file>.dc.html` (original canvas source).
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
| 8 | Authentication | OTP | E-OTP | `/(auth)/otp` | 915 |
| 9 | Authentication | Forgot password | E-Forgot | `/(auth)/forgot-password` | 915 |
| 10 | Home | Dashboard | BN-Home | `/home` | 1298 |
| 11 | Home | Recommended tools | BN-Tools | `/home/recommended-tools` | 1391 |
| 12 | Home | AI Assistant | BN-Assistant | `/home/ai-assistant` | 915 |
| 13 | Create | Create hub | BN-CreateHub | `/create` | 1108 |
| 14 | Create | AutoClip | BN-Create | `/create/autoclip` | 915 |
| 15 | Create | Text to Video | BN-TextVideo | `/create/text-to-video` | 915 |
| 16 | Create | Script to Video | BN-ScriptVideo | `/create/script-to-video` | 972 |
| 17 | Create | AI Avatar | BN-Avatar | `/create/ai-avatar` | 915 |
| 18 | Create | Image to Video | BN-ImageVideo | `/create/image-to-video` | 915 |
| 19 | Create | Split Screen | BN-SplitScreen | `/create/split-screen` | 925 |
| 20 | Create | AI Media | BN-AIMedia | `/create/ai-media` | 915 |
| 21 | Editor | Timeline | BN-Editor | `/editor` | 915 |
| 22 | Editor | Captions | BN-EdCaptions | `/editor/captions` | 915 |
| 23 | Editor | Audio | BN-EdAudio | `/editor/audio` | 915 |
| 24 | Editor | Text | BN-EdText | `/editor/text` | 915 |
| 25 | Editor | Effects | BN-EdEffects | `/editor/effects` | 915 |
| 26 | Editor | AI Tools | BN-EdAI | `/editor/ai-tools` | 915 |
| 27 | Editor | Export | BN-EdExport | `/editor/export` | 915 |
| 28 | Projects | All | BN-Projects | `/projects` | 1041 |
| 29 | Projects | Drafts | BN-Drafts | `/projects/drafts` | 915 |
| 30 | Projects | Videos · Reels · Shorts | BN-Shorts | `/projects/videos-reels-shorts` | 915 |
| 31 | Projects | Project detail | BN-Insights | `/projects/project-detail` | 1006 |
| 32 | Assets | All · Videos · Images | BN-Assets | `/assets` | 1046 |
| 33 | Assets | Audio | BN-AssetsAudio | `/assets/audio` | 915 |
| 34 | Assets | AI Assets | BN-AssetsAI | `/assets/ai-assets` | 949 |
| 35 | Insights | Overview | BN-InsOverview | `/insights` | 931 |
| 36 | Insights | Content performance | BN-InsContent | `/insights/content-performance` | 975 |
| 37 | Insights | Platform analytics | BN-InsPlatform | `/insights/platform-analytics` | 1081 |
| 38 | Insights | Account analytics | BN-Social | `/insights/account-analytics` | 1120 |
| 39 | Social Studio | Accounts | BN-Accounts | `/social-studio` | 915 |
| 40 | Social Studio | Content calendar | BN-Calendar | `/social-studio/content-calendar` | 915 |
| 41 | Social Studio | Composer | BN-Composer | `/social-studio/composer` | 915 |
| 42 | Social Studio | Scheduled posts | BN-Scheduled | `/social-studio/scheduled-posts` | 915 |
| 43 | You | Profile | BN-Profile | `/you` | 1223 |
| 44 | You | My Voices | BN-Voices | `/you/my-voices` | 915 |
| 45 | You | My Avatars | BN-Avatars | `/you/my-avatars` | 915 |
| 46 | You | Brand Kit | BN-BrandKit | `/you/brand-kit` | 915 |
| 47 | You | Credits | BN-Credits | `/you/credits` | 1059 |
| 48 | You | Subscription | BN-Subscription | `/you/subscription` | 1201 |
| 49 | You | Notifications | BN-Notifications | `/you/notifications` | 915 |
| 50 | You | Settings | BN-Settings | `/you/settings` | 1296 |
| 51 | You | Help & Support | BN-Help | `/you/help-support` | 915 |
| 52 | You | Legal | BN-Legal | `/you/legal` | 915 |

## Navigation
- Tabs (floating pill bar): Home · Projects · Create (centre, emerald) · Social · You
- Stack: splash → onboarding (4) → login / sign-up → OTP → Home
- Full-screen modals: Editor + its panels (bottom sheets), Export, Composer, AI Assistant
- Assets reached from Projects header and Create hub; Insights from Home and Social Studio

## Data each area needs (from clipiro.com)
- Home: clip count, active projects, clip minutes, AI credits, creator level/XP, recent clips, tools
- AutoClip: upload (MP4/MOV/WebM ≤500 MB, 1 min–1 h 30 m) or link, clip length (<30s/15–60s/60s+), count, aspect ratio, caption style, advanced; cost = 1 Clip Minute per video minute
- Clips: virality score, rank, length, format, status (Ready/Rendering/Failed), starred
- Assets: storage used/limit, folders, type, size, length, favourites, archive
- Social tracker: accounts + health, followers, views, engagement, interactions, weekly AI summary (5 credits), sync/report/share/CSV
- Plans: Free $0 / Creator $15 / Pro $29 / Studio $59 per month; credit packs 30/100/280/640; minute packs 100/300/1000
- NEW (not on web yet): post scheduling/composer, AI avatars, voice cloning, text/script/image-to-video, split screen
