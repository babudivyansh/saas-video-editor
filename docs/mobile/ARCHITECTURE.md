# Clipiro Android — architecture (Phase 0)

Written 2026-10-01 from a read-only survey of this repo (`main` @ f20c41a + handoff design).
Paths are repo-relative. "Web" = the existing Next.js app, which becomes `apps/web` in Phase 1.

Legend for the screen table (§2):
- **R**: reuse existing API as-is (works with a Bearer token once the proxy fix in §3 lands)
- **W**: thin new mobile endpoint or wrapper over existing services (no new business logic)
- **N**: new backend feature (tables, jobs, and/or providers)
- **C**: client-only: static content or local preferences

---

## 1. What exists today

### Auth (custom; not NextAuth)
- JWT, HS256 (`JWT_SECRET`), payload `{userId, email, sessionId}`, **7-day expiry, no refresh token**: `lib/auth.ts:14-46`.
- Per-device session records in Redis (`sessions:<userId>`, sha256 token hash, 7d TTL): `lib/auth.ts:136-190`.
- `getAuthUser` reads **only** `Authorization: Bearer`: `lib/auth.ts:192`. `getServerAuthUser` reads the `session` cookie, for RSC only.
- **Login:** `app/api/auth/login/route.ts` returns `{token, user}`. It can instead return:
  - `{requires2fa, ticket}` → `app/api/auth/2fa/verify-login`
  - `{requiresEmailVerification}` → `verify-otp`
  - 403 for deactivated or suspended accounts
- **Sign-up (email OTP):**
  1. `POST auth/register` returns 202 `{pending, signupToken}`; the pending signup lives in Redis (`lib/signup-pending.ts`).
  2. `POST auth/register/verify {email, otp, signupToken}` returns `{token, user}`.
  3. `auth/register/resend` resends the code.
  - Codes are **6 digits** (`lib/otp.ts:17`).
- **Passwordless email OTP:** `auth/send-otp` then `auth/verify-otp`. Phone login was removed on 2026-09-28.
- **Google:** web redirect flow only (`app/api/auth/google`, `app/api/auth/callback/google`). The callback returns HTML that writes the token into localStorage. **There is no ID-token exchange.**
- **2FA (TOTP plus recovery codes):** `app/api/auth/2fa/*`, `lib/two-factor-ticket.ts`. Step-up by emailed code: `lib/step-up.ts`.
- **Password and email:** `auth/forgot-password` emails a **web** link, `/reset-password?t=`. `auth/reset-password`, `change-email` (+ `/confirm`, also a web link), and `change-password` complete the set.
- **Account:**
  - Profile: `auth/profile` (PATCH updates it; DELETE deletes the account).
  - Sessions: `auth/sessions`.
  - Status: `account/deactivate`, `account/reactivate`, `account/export` (async; poll the job).
- **Rate limits:**
  - Inline `rateLimit()` on login, register and the OTP routes: 8 per email and 30 per IP per 15 min on login.
  - `withRateLimit` (`lib/with-rate-limit.ts`) on everything else.
  - `proxy.ts` group limits on admin, social, billing and affiliate routes.
- **CSRF / Origin:** there are no Origin checks anywhere, so native clients are not blocked. CSP is Report-Only (`lib/csp.ts`).
- **API keys:** `sk_live_…` keys for the public `app/api/v1/*` (projects, clips). Checked by `getApiKeyAuth` (`lib/auth.ts:370`).

### Users, levels, quests
- `User` model: `prisma/schema.prisma:15-205`.
  - Plan fields: `planId`, `subscriptionEndsAt`, `trialEndsAt`.
  - Two meters, credits and minutes, each with `bonus*`, `subscription*` and `purchased*` buckets.
  - Onboarding and tour fields.
- **XP and level have no column.** They are derived from `UserQuest` rows and `lib/quest-config.ts`:
  - 10 quests worth 100–500 XP each.
  - Ranks: Beginner 0 → Creator 500 → Pro Creator 1100 → Clipiro Master. Rank-ups grant 15/30/60 bonus minutes.
  - Code: `lib/quests.ts`, `lib/quest-rewards.ts`, `app/api/quests*`.
- `GET app/api/auth/me` returns the profile, plan, tier, and credit and minute balances.

### AutoClip
- **Order of calls:**
  1. `POST api/projects {productType:"auto-clip"}`
  2. Upload, or import a link
  3. `PATCH api/projects/[id] {uploadedVideoUrl}` (validated by `lib/source-url.ts`)
  4. `POST api/generate/auto-clip` → `startAutoClipRun` (`lib/autoclip-start.ts`)
- **Input:** `lib/autoclip-create-input.ts`
  - Clip length: min/max 5–300 s
  - Count: 1–20
  - Aspect ratio: 9:16, 16:9 or 1:1
  - Instructions, up to 500 chars
  - Silence and filler removal, reframe, caption template, `allowCreditOverflow`
- **Upload:**
  - Files up to 25 MB: multipart form to `api/upload`.
  - Larger files: presigned S3 multipart, `api/upload/multipart/{create,part-url,complete,abort}`. Parts go straight to S3. `complete` registers the file as an Asset (`lib/asset-service.ts`).
- **Limits by tier** (`lib/plans/tiers.ts`; the client reads them from `api/upload-policy`):

  | Tier | Max file | Max source length |
  |---|---|---|
  | Free | 250 MB | 30 min |
  | Creator | 1 GB | 2 h |
  | Pro | 2 GB | 4 h |
  | Studio | 5 GB | 6 h |

- **Link import:** `api/projects/[id]/import-url`. GET probes the link; POST downloads it with yt-dlp.
  - Allowed hosts: YouTube, Vimeo, Google Drive/Docs, Dropbox, Loom (`lib/url-import.ts`).
- **Pipeline:** `lib/autoclip-pipeline.ts`
  - Pick step: probe → charge minutes → transcribe → Gemini 2.5 Flash picks and scores segments → render.
  - Rendering uses ffmpeg, or the GPU service (`gpu-service/`, `lib/render-target.ts`) for some tiers.
  - Queue: BullMQ by default, or the in-process FIFO when `RENDER_QUEUE_DRIVER=in-process` (`lib/render-queue.ts`, `lib/job-queue.ts`).
- **Scores and status:**
  - `Clip.score` is a calibrated 0–99 virality score, with sub-scores in `scoreBreakdown` (`lib/virality-score.ts`). Rank is the score sort order.
  - Clip status: `queued | rendering | ready | failed`, with `progress`.
  - Project status: `draft | analyzing | rendering | completed | failed`.
- **Polling:** `GET api/projects/[id]/clips` (the web polls every 2.5 s). Cross-project list: `GET api/clips?favorite&sort=score`.
- **Clip actions:**
  - Star: `PATCH …/clips/[clipId] {isFavorite}`.
  - Download: `…/clips/[clipId]/download` (streams the file), `…/clips/download-all` (zip).
  - Also: `rerender`, `dub`, `translate`, `captions/render`, `publish`.
- **Cost:** 1 Clip Minute per source minute, rounded up (`lib/autoclip-pricing.ts`, `lib/autoclip-minutes.ts`).
  - Re-running the same source within 7 days is free.
  - A minutes shortfall can be paid in credits at 3 minutes per credit.
  - Failed runs are refunded in full (`refundRunCharge`), and the `cron/stale-clip-sweep` watchdog catches stuck clips.
- **Completion:** an in-app `notify()` plus the `clips-ready` email (`lib/email.ts:244`).

### Projects
- `api/projects`: GET lists with a cursor; POST can create only `auto-clip` or `editor` projects (`CREATABLE_PRODUCT_TYPES`).
- `api/projects/[id]`: GET, PATCH (`editorDoc` saves need `expectedVersion`; a stale version gets 409), and DELETE (hard delete).
- `api/dashboard/summary` (Redis-cached): project counts, clip total, in-progress projects.

### Assets
- **Models:** `Asset` (`kind` video/audio/image; `sourceFeature` records where it came from; `isFavorite`; `archivedAt`), `AssetFolder` (flat), `Tag`.
- **Endpoints:**
  - `api/assets`: filters, cursor, `?stats=true` (used and limit bytes, counts by kind).
  - `api/assets/[id]`: PATCH (rename, move, favourite, restore); DELETE archives first, then deletes permanently.
  - `api/assets/bulk`, `api/assets/folders`, `api/assets/tags`.
- **Storage quotas:** Free 0.5 GB, Creator 2 GB, Pro 5 GB, Studio 15 GB.

### Editor
- **Document:** `TimelineDoc` (`lib/editor/types.ts`, `validateDoc` at line 390), stored in `Project.editorDoc`.
  - Tracks: video, text, audio, image, caption.
  - Size limit 1 MB, 1000 caption clips.
- **Export:** `POST api/editor/render {projectId}` costs 1 credit and renders server-side with ffmpeg (`lib/editor/render-job.ts`). Poll the project for status.
- **Captions:**
  - Speech-to-text: `api/editor/captions`, billed in minutes.
  - Templates: `api/caption-templates` (`lib/captions/templateRegistry.ts`).
  - Renders: `api/caption-renders/[id]`.
  - The Submagic provider is fully built but inactive until `SUBMAGIC_API_KEY` is set.
- **Stock media:** `api/editor/stock/*` (Pexels, Giphy, Jamendo).
- **Brand kits:** `api/brand-kits`. The `BrandKit` model holds **caption style only** (font, colours, outline).

### AI tools (`app/api/tools/*`, prices in `lib/tool-costs.ts`)
- **Image generator:** 9 models via fal (`lib/models/imageModels.ts`).
- **Voiceover** (ElevenLabs) and **voice preview**.
- **Audio:** enhance-speech, vocal-remover, voice-changer, audio-balancer.
- **Pro only:** face-swap, subtitle-remover.
- **Other:** background-remover, brainstormer, enhance-prompt, cut-and-crop.
- **Free:** compressor, mp3-converter, YouTube and Instagram downloaders.
- **Clip dubbing:** 20 credits per minute.
- **Job model is the weak spot.** Tool routes return `{jobId}` and are polled with `GET ?jobId=`. The jobs are held in a **per-process in-memory Map** (`lib/job-routes.ts:54`). They are lost on restart and not shared across instances, which is bad for a phone that backgrounds and reconnects.
- **DB-backed status** does exist for: `Generation` rows (status, progress; history at `api/generations`), caption renders, clip dubs, account export, and bulk downloads.
- **Charging:** `chargeCredits` / `refundCredits` with idempotency keys (`lib/credits.ts`).

### Billing
- **Plans:** `prisma/seed.ts`, prices in INR paise. USD comes from `lib/currency.ts`. Public list: `api/plans`.

  | Plan | USD / month | Clip Minutes / month | AI credits / month |
  |---|---|---|---|
  | Free | $0 | 30 (watermarked bonus) | 10 (bonus) |
  | Creator | $15 | 150 | 50 |
  | Pro | $29 | 400 | 150 |
  | Studio | $59 | 1000 | 400 |

  - Yearly is 33% off.
  - Trial: 7 days, monthly Pro only (`lib/billing/trial.ts`). The "3-day" in the design is the money-back guarantee, which is correct.
- **Packs** (USD prices are converted from INR, not set in a price book):
  - Credit packs: 30 / 100 / 280 / 640 credits for $6.99 / $17.99 / $44.99 / $101.99.
  - Minute packs: 100 / 300 / 1000 minutes for $11.99 / $29.99 / $89.99.
  - **All plan and pack figures in the design match the database.**
- **Balances:** `lib/credits.ts` and `lib/minutes.ts`. Each change writes a ledger row (`CreditTransaction` / `MinuteTransaction`). **There is no user-facing ledger endpoint**, which the Credits "Recent activity" list needs.
- **Razorpay only:**
  - Checkout, verify, cancel and resume: `api/billing/*`.
  - Webhook: `api/webhooks/razorpay`.
  - GST invoices: `lib/invoice/*`.

### Social tracker (v2)
- **Platforms:** YouTube (Google OAuth), and Instagram and Facebook (Meta OAuth). **No TikTok, X or LinkedIn.** Code: `lib/social/*`, `api/social/connect|callback/[provider]` (web redirect callbacks).
- **Data:**
  - `SocialAccount.status` is active / needs_reauth / revoked, with a nightly `healthScore`.
  - Snapshots, daily metrics, posts (virality and AI scores), and `SocialAudienceSnapshot` (age, gender, country …).
- **Endpoints:** `api/social/{accounts,analytics,audience,overview,series,content,competitors,goals,summary,reports,report-link,export}`.
- **Credit costs:** the weekly AI summary is 5 credits (free if one was made in the last 6 days); recommendations are 3 credits.
- **Competitors:** ScrapeCreators, Instagram and YouTube only, with a monthly budget.
- **Publishing (partial):**
  - YouTube has the `youtube.upload` scope. `lib/clip-scheduler.ts` and `cron/clip-publish` post due `ClipPublish` rows.
  - Instagram and Facebook are read-only: a "scheduled" post there becomes a reminder (`lib/autoclip-publish.ts`).

### Notifications
- **Model:** `Notification` (`schema:1839`). Routes: `api/notifications` (offset cursor, `unreadCount`), `unread-count`, `read-all`, `[id]/read`.
- **Created by** `lib/notify.ts`, for: AutoClip done or failed, billing payment failed or halted, and reviews.
- **Preferences:** `NotificationPreference` holds **email** categories only.
- **No push:** no FCM, no device tokens, no web-push.

### Other
- **Help:** static article content in `app/help/articles.ts`.
- **Legal:** `app/legal/documents.ts` plus the `/privacy`, `/terms`, `/refund` and `/cookies` pages.
- **Referral program:** `api/affiliate/*`, 20% recurring (the design's "Earn credits" card).
- **Tools list:** `app/components/featureLinks.ts`.
- **Cron:** Hostinger has no cron. An external cron-job.org job hits `GET api/cron-tick` every minute, which runs whatever is due in `lib/cron-schedule.ts`. `ops/crontab` must stay in sync (lint-enforced).
- **Env vars** (names only; validated in `lib/env.ts`):
  - Core: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `NEXT_PUBLIC_APP_URL`, `TRUSTED_PROXY_COUNT`, `AUDIT_HMAC_KEY`, `SOCIAL_TOKEN_KEY`
  - Storage: `AWS_*`, `AWS_S3_BUCKET`, `CDN_BASE_URL`
  - AI: `FAL_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`
  - ElevenLabs: `ELEVENLABS_API_KEY`, `ELEVENLABS_MAX_VOICE_SLOTS`, `ELEVENLABS_WEBHOOK_SECRET`, `ELEVENLABS_VOICE_*`
  - Submagic: `SUBMAGIC_*`
  - Stock and social data: `PEXELS_API_KEY`, `GIPHY_API_KEY`, `JAMENDO_CLIENT_ID`, `SCRAPECREATORS_API_KEY`
  - GPU and rendering: `GPU_SERVICE_*`, `CLIPIRO_FFMPEG_PATH`, `RENDER_*`
  - Payments: `RAZORPAY_*`
  - Email: `EMAIL_*`, `RESEND_*`
  - OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `META_APP_ID`, `META_APP_SECRET`
  - Social jobs: `SOCIAL_*`
  - Monitoring: `SENTRY_*`
  - Cron: `CRON_SECRET`, `ASSET_CLEANUP_SECRET`
  - Public links: `NEXT_PUBLIC_*` social links
  - **There is no Anthropic key yet.** Phase 13 (the AI Assistant) needs one.

---

## 2. Screen by screen: reuse vs new work

| # | Screen | Kind | Backend it uses / what's missing |
|---|---|---|---|
| 1 | Splash | C | — |
| 2–5 | Onboarding ×4 | C | Optionally `api/onboarding/complete` |
| 6 | Login | R + W | `auth/login`, `2fa/verify-login`. **W:** Google ID-token exchange |
| 7 | Sign up | R | `auth/register` (also send `confirmPassword`). The design has no confirm field; the client can send the same value twice |
| 8 | OTP | R | `auth/register/verify`, `resend`. **The design shows 4 boxes; the backend sends 6 digits** |
| 9 | Forgot password | R | `auth/forgot-password`. The reset link opens the website; an app deep link is optional |
| 10 | Home | W | Aggregate of `auth/me` + `dashboard/summary` + quests (XP/rank) + top clips (`api/clips?sort=score`) into one call |
| 11 | Recommended tools | C | Static list from `featureLinks.ts` + `tool-costs.ts` |
| 12 | AI Assistant | **N** | New: server-side LLM with tools (Phase 13) |
| 13 | Create hub | C | — |
| 14 | AutoClip | R | projects → upload (multipart) / import-url → `generate/auto-clip` → poll clips. **The design's fixed "≤500 MB, 1 min–1 h 30 m" must come from `api/upload-policy` (limits vary by tier)** |
| 15 | Text to Video | **N** | Never existed. The AI video generator was removed in PR #257 (it never saved its videos) |
| 16 | Script to Video | **N** | Never existed |
| 17 | AI Avatar | **N** | Never existed (no avatar provider) |
| 18 | Image to Video | **N** | Never existed |
| 19 | Split Screen | **N** | Existed; removed 2026-09-10 (`d216588`). Leftover references in `lib/reframe.ts` and `lib/caption-render-job.ts` |
| 20 | AI Media | R + W | `tools/image-generator` (9 models), `voiceover`, `enhance-speech`, `vocal-remover`. **W:** DB-backed job status (see §4, R3) |
| 21 | Editor timeline | R | `projects/[id]` `editorDoc` + `expectedVersion`, `TimelineDoc`. Most of the work is client-side |
| 22 | Captions panel | R | `caption-templates`, `editor/captions` (speech-to-text) |
| 23 | Audio panel | R | enhance-speech (8 cr), vocal-remover (1 cr), Jamendo music via `editor/stock`, voiceover. "Cut silences" exists as an AutoClip option; needs checking for the editor doc |
| 24 | Text panel | R | Text track in `TimelineDoc`. Fonts: Geist/Bebas/Serif/Mono (Bebas Neue is already in globals.css) |
| 25 | Effects panel | R / N | Effects and transitions render via filtergraph (#96). The design's set (Zoom punch, Glow, Shake, Blur in, B&W, Film grain) is to be mapped in Phase 9; any missing effects are **N** |
| 26 | AI Tools panel | R / N | Face swap, subtitle remover, voice changer, dub (AutoClip clips only) and background remover exist. **Auto-reframe inside the editor** exists only inside AutoClip (`lib/reframe.ts`) |
| 27 | Export | R / N | `editor/render` (1 credit). 720p/1080p/30fps render today; **4K and 60 fps need checking**. The "Post" destination depends on scheduling (row 41) |
| 28 | Projects: All | R | `api/projects`. The design shows product types that don't exist (Image to Video, Script to Video, AI Avatar) |
| 29 | Drafts | R / W | `api/projects?status=draft`. **The "60%" progress per draft has no backing field** |
| 30 | Videos · Reels · Shorts | W | Clips filtered by aspect ratio: needs an `aspectRatio` filter on `api/clips` |
| 31 | Project detail | R | `projects/[id]/clips`, star, download, download-all. Score spread is computed on the client |
| 32 | Assets All/Videos/Images | R | `api/assets` + `?stats=true`, folders, bulk |
| 33 | Assets Audio | R | `api/assets?kind=audio` |
| 34 | AI Assets | W / N | Needs a `sourceFeature` filter on `api/assets`. The Avatars section is **N** |
| 35 | Insights overview | R | `social/overview`, `series`. **TikTok share in the design has no data (no TikTok)** |
| 36 | Content performance | R | `social/content`, `social/export` (CSV) |
| 37 | Platform analytics | R | `social/analytics`, `social/audience` (age and country snapshots exist) |
| 38 | Account analytics | R | `social/*`, `summary` (5 cr), health score. Audience, Competitors and Reports tabs exist on the backend but have **no mobile designs** |
| 39 | Accounts | R + W | `social/accounts`. **W:** OAuth connect from the app (in-app browser plus a deep-link return). TikTok, X and LinkedIn are **N** |
| 40 | Content calendar | **N** | Only `ClipPublish` (YouTube) exists. Needs SCHEDULING.md (Phase 11) |
| 41 | Composer | **N** | Posting to TikTok, Reels or Shorts: only YouTube upload exists. Instagram and Facebook need publish scopes plus Meta app review; TikTok needs Content Posting API approval |
| 42 | Scheduled posts | **N** | As above |
| 43 | Profile | R | `auth/me`, quests. The UID shown is `user.id` |
| 44 | My Voices | R + **N** | The stock voice list exists (`ELEVENLABS_VOICE_*`, `voice-preview`). **Cloning is N:** the `ClonedVoice` model and `lib/cloned-voices.ts` exist with no route, and the ElevenLabs account is on the free tier (3 voice slots; cloning needs a paid plan) |
| 45 | My Avatars | **N** | No avatar provider |
| 46 | Brand Kit | R + **N** | `brand-kits` covers caption style. **Logo, colour palette, fonts, watermark and intro/outro are new fields and new render support** |
| 47 | Credits | R + W | Balances from `auth/me`. **W:** ledger list ("Recent activity"). Buying is blocked on billing (§4) |
| 48 | Subscription | R + **decision** | `api/plans`, `billing/*`. The design shows Razorpay/UPI checkout, which conflicts with Play policy (§4) |
| 49 | Notifications | R + **N** | The list and read-all exist. **Push is N** (device tokens + FCM hook in `notify()`). Tabs (Renders/Social/Account) map from `type`. Social types (posted, reconnect) don't exist yet |
| 50 | Settings | R + C | `notification-preferences` (email only), `auth/sessions`, `change-password`, `api-keys`, deactivate or delete. Autoplay, haptics, Wi-Fi-only and default export are stored on the device. Push toggles are **N** |
| 51 | Help & Support | W | Serve `app/help/articles.ts` as JSON, or bundle it. "Report a bug / send logs" has no backend. Note from earlier work: the web contact form is fake |
| 52 | Legal | C | Open the web pages in an in-app browser. The design's `[DATE]` placeholder needs real dates |

**Summary:** about 30 screens are R/C, 8 need thin wrappers, and 13 need new backend features. The new-feature screens are Assistant, Text/Script/Image-to-Video, Avatar, Split Screen, Calendar, Composer, Scheduled, voice cloning, avatars, the extended brand kit, and push.

---

## 3. Mobile auth approach

**Blocker found:** `proxy.ts:52-60` and `:111` (`getOptimisticAuth`) gate every non-public `/api/*` route on the **`session` cookie only**, and return 401 without it. `getAuthUser` then requires the **Bearer** header. So today a native client must send both. (An earlier assumption that "Bearer alone works" is wrong.)

**Proposal (Phase 5):**
1. **Proxy:** `getOptimisticAuth` accepts `Authorization: Bearer <jwt>` as well as the cookie, verified the same way. This is a one-function change and doesn't affect the web.
2. **Tokens:** `/api/mobile/v1/auth/*` issues:
   - A **short-lived access JWT** (about 1 h), in the same format as today and backed by the same Redis session record, so `getAuthUser` stays untouched.
   - A **rotating refresh token**: opaque, stored hashed on the session record, 60-day sliding lifetime. Reusing an old refresh token revokes the whole session.
   - Logout and "sign out other devices" reuse `auth/sessions`.
3. **Storage:** both tokens live in `expo-secure-store` (Android Keystore) and never in AsyncStorage. The API client refreshes once on a 401 and then signs the user out.
4. **Google:** native Google Sign-In gives an **ID token**. A new `POST /api/mobile/v1/auth/google {idToken}` verifies it against Google's JWKS (audience = the Android and web client IDs), then reuses the find-or-create logic from `app/api/auth/callback/google` (to be extracted into `lib/` rather than copied). A 2FA-enabled account gets the same `{requires2fa, ticket}` response.
5. **Sign-up, OTP, 2FA, forgot password:** reuse the existing routes through thin `/mobile/v1` wrappers, so everything is under one versioned, zod-validated surface. Rate limits stay as they are.
6. **Email links** (reset password, change email): keep the web pages at first. Android App Links (`https://clipiro.com/reset-password`) come in Phase 15.

---

## 4. Risks and open questions

**R1. Phase 1 monorepo vs the Hostinger deploy.** This is the highest risk.
- **Deploy scripts assume the repo root:**
  - `scripts/postbuild.js` looks for a hardcoded `/home/u154310472/domains/clipiro.com/public_html` and `../public_html` relative to the working directory.
  - `next.config.ts` sets `turbopack.root: __dirname`, uses `workerThreads` (the fix for the Turbopack spawn crash, #261), and has file-tracing includes for `./vendor/ffmpeg` and `node_modules`.
  - The `postinstall` script installs the render ffmpeg binary.
- **Package manager:** npm → pnpm changes how `node_modules` is laid out (symlinked), which the standalone file tracing and Prisma both depend on.
- **CI** (`.github/workflows/ci.yml`) runs at the root; so do `tsconfig`'s `**/*.ts`, vitest's `**/*.test.ts` and eslint. Mobile files would otherwise get type-checked and linted as web code.
- **Q:** Can Hostinger's app settings point at `apps/web` (root directory, build and start commands)? If not, Phase 1 needs a root-level build that runs inside `apps/web`.
- **Q:** Should Phase 1 stay on npm workspaces instead of pnpm? That would be much lower risk for the deploy, but it differs from the playbook.

**R2. Play Billing vs Razorpay.** Credits and subscriptions are digital goods, so Google Play requires Play Billing. India's user-choice billing may allow Razorpay as an alternative, with a reduced service fee. The Subscription and Credits screens show Razorpay/UPI.
- **Q:** Decide in Phase 12 (BILLING.md). Until then, should the app show plans read-only and link out to the web?

**R3. The tool job model.** In-memory `jobId`s (`lib/job-routes.ts`) don't survive a restart or a second instance. The playbook's "POST job → poll /jobs/:id → push" needs a **DB-backed job** (extend `Generation` or add a `Job` table) before the phone relies on it (Phase 5).

**R4. Removed products are back in the design.** Text/Script/Image-to-Video, AI Avatar and Split Screen were removed from the web in September 2026, partly because of cost and persistence problems.
- **Q:** Build them for real (Phase 10) or ship "Coming soon"? Each needs a provider choice and pricing.

**R5. Provider limits.** The ElevenLabs account is on the free tier (10k characters a month, 3 voice slots; Voice Library and Music are paid only), so voice cloning and heavy voiceover need a paid plan. Submagic is inactive without a key.

**R6. Social publishing.**
- TikTok: nothing exists. The Content Posting API needs an audit and approval.
- Instagram/Facebook: need `instagram_content_publish` and Meta app review.
- YouTube: upload exists.
- Calendar, Composer and Scheduled need SCHEDULING.md (Phase 11). The design also lists X, LinkedIn and Facebook under "Connect more".

**R7. Design vs backend mismatches** (to resolve, or accept the backend's version):
- The OTP has 4 boxes but the backend sends 6 digits.
- The AutoClip limits text is fixed; the real limits vary by tier.
- The "60%" on drafts has no data behind it.
- The editor toolbar shows Media, Filters, Transitions and Image, but there are only 5 panel designs (Captions, Audio, Text, Effects, AI Tools).
- Account analytics has Audience, Competitors and Reports tabs with no designs.
- The Legal screen shows `[DATE]`.
- The Insights screens show TikTok data (no TikTok support).
- The Composer shows TikTok, Reels and Shorts.

**R8. Push.** Push needs FCM (a Firebase project and `google-services.json`), a `DeviceToken` table, and a hook in `notify()`. Hostinger has no background worker other than cron-tick, which is fine because pushes go out inline from `notify()`.

**R9. Queue driver in production.** `lib/job-queue.ts` says production runs the in-process driver, while `lib/render-queue.ts` defaults to BullMQ. Long AutoClip runs plus a backgrounded phone mean completion push matters more.
- **Q:** Confirm the value of `RENDER_QUEUE_DRIVER` on Hostinger.

**R10. AI Assistant.** There is no Anthropic key in env today. It also needs a decision on how it's charged: per message, or a credit cost per tool action.

**R11. Editor scope and performance.** The web editor is complex (the #96 filtergraph, captions, versioned saves). A 60 fps native timeline is Phase 9's biggest piece of work. The editor document must stay the same `TimelineDoc` so web and mobile edit the same projects.

**Open questions for you, in short:**
1. Hostinger: can the app root be set to `apps/web`? And pnpm (as the playbook says) or npm workspaces (safer)?
2. Removed products (rows 15–19, 45): build them, or show "Coming soon" for v1?
3. Billing: read-only plans plus a link to the web until BILLING.md is decided. OK?
4. Social publishing: is YouTube-only publishing in v1 acceptable, with TikTok and Instagram later?
5. OTP: change the design to 6 boxes? (Recommended; don't weaken the backend.)
6. `RENDER_QUEUE_DRIVER` in production: BullMQ or in-process?
7. ElevenLabs: will you upgrade the plan for voice cloning, or hide cloning in v1?
