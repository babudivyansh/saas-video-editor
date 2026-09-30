# Clipiro Android — architecture (Phase 0)

Written 2026-10-01 from a read-only survey of this repo (`main` @ f20c41a + handoff design). Updated the same day with the user's decisions and the design revision (§2, §4).
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

The numbers follow `design/SCREENS.md` after the 2026-10-01 revision (50 screens).

| # | Screen | Kind | Backend it uses / what's missing |
|---|---|---|---|
| 1 | Splash | C | — |
| 2–5 | Onboarding ×4 | C | Optionally `api/onboarding/complete` |
| 6 | Login | R + W | `auth/login`, `2fa/verify-login`. **W:** Google ID-token exchange |
| 7 | Sign up | R | `auth/register`. The design has no confirm field, so the client sends the password as `confirmPassword` too |
| 8 | OTP | R | `auth/register/verify`, `resend`. 6 digits, matching the design |
| 9 | Forgot password | R | `auth/forgot-password`. The reset link opens the website; an app deep link comes in Phase 15 |
| 10 | Home | W | One aggregate call: `auth/me` + `dashboard/summary` + quests (XP/rank) + top clips (`api/clips?sort=score`) |
| 11 | Recommended tools | C | Static list from `featureLinks.ts` + `tool-costs.ts` |
| 12 | AI Assistant | **N** | New: server-side LLM with tools (Phase 13) |
| 13 | Create hub | C | Editor, AI Media, and shortcuts to existing AI tools |
| 14 | AutoClip | R | projects → upload (multipart) / import-url → `generate/auto-clip` → poll clips. The limits line comes from `api/upload-policy` (varies by plan) |
| 15 | AI Media | R + W | `tools/image-generator`, `voiceover`, `enhance-speech`, `vocal-remover`. **W:** DB-backed job status (R3) |
| 16 | Editor timeline | R | `projects/[id]` `editorDoc` + `expectedVersion`. Most of the work is client-side |
| 17 | Media sheet (new) | R | Assets: `api/assets`. Upload: `api/upload*`. Stock: `api/editor/stock/*` (Pexels, Giphy) |
| 18 | Captions | R | `caption-templates`, `editor/captions` (speech-to-text) |
| 19 | Audio | R | enhance-speech, vocal-remover, Jamendo music via `editor/stock`, voiceover. "Cut silences" in the editor needs checking in Phase 9 |
| 20 | Text | R | Text track in `TimelineDoc` |
| 21 | Effects · Filters · Transitions | R / N | Rendered via filtergraph (#96). Map the design's effect set in Phase 9; any missing effects are **N** |
| 22 | AI Tools | R / N | Face swap, subtitle remover, voice changer, dub and background remover exist. Auto-reframe exists only inside AutoClip (`lib/reframe.ts`) |
| 23 | Export | R / N | `editor/render` (1 credit). **4K and 60 fps need checking.** "Post" goes to the Composer |
| 24 | Projects: All | R | `api/projects` (AutoClip and Editor projects only) |
| 25 | Drafts | R + **N** | `api/projects?status=draft` + **draft progress** (below) |
| 26 | Videos · Reels · Shorts | W | Needs an `aspectRatio` filter on `api/clips` |
| 27 | Project detail | R | `projects/[id]/clips`, star, download, download-all |
| 28 | Assets All/Videos/Images | R | `api/assets` + `?stats=true`, folders, bulk |
| 29 | Assets Audio | R | `api/assets?kind=audio` |
| 30 | AI Assets | W | Needs a `sourceFeature` filter on `api/assets`. Sections: AI images, voiceovers, audio cleanup |
| 31 | Insights overview | R | `social/overview`, `series` |
| 32 | Content performance | R | `social/content`, `social/export` (CSV) |
| 33 | Platform analytics | R | `social/analytics`, `social/audience` |
| 34 | Account analytics · Overview | R | `social/*`, `summary` (5 cr), health score |
| 35 | Account analytics · Audience (new) | R | `social/audience` (`SocialAudienceSnapshot`: gender, age, country, city, activeHour × activeDay) |
| 36 | Account analytics · Competitors (new) | R | `social/competitors` (max 3, Instagram and YouTube), `competitors/compare` |
| 37 | Account analytics · Reports (new) | R | `social/reports` (configs, runs, PDF/CSV/XLSX, schedules), `social/report-link` (share and revoke) |
| 38 | Accounts | R + W | `social/accounts`. **W:** OAuth connect from the app (in-app browser plus a deep-link return). YouTube, Instagram and Facebook only |
| 39 | Content calendar | **N** | SCHEDULING.md (Phase 11). YouTube publish exists (`ClipPublish`, `cron/clip-publish`) |
| 40 | Composer | **N** | YouTube Shorts in v1; Instagram Reels and Facebook are "Soon" (need publish scopes and Meta app review) |
| 41 | Scheduled posts | **N** | As above |
| 42 | Profile | R | `auth/me`, quests |
| 43 | My Voices | R + **N** | The stock voice list exists. **Cloning is v1** (decided): add a route over `ClonedVoice` / `lib/cloned-voices.ts`, with consent capture. Needs the paid ElevenLabs plan |
| 44 | Brand Kit | R + **N** | `brand-kits` covers caption style. Logo, palette, fonts, watermark and intro/outro are new |
| 45 | Credits | R + W | Balances from `auth/me`. **W:** ledger list ("Recent activity"). No purchase UI until Phase 12 |
| 46 | Subscription | R | `api/plans`, current plan. Read-only until Phase 12; `billing/cancel` can stay |
| 47 | Notifications | R + **N** | List and read-all exist. **Push is N.** Tabs map from `type`; social types (posted, reconnect) are new |
| 48 | Settings | R + C | `notification-preferences`, `auth/sessions`, `change-password`, `api-keys`, deactivate or delete. Device-only toggles are stored locally |
| 49 | Help & Support | W | Serve `app/help/articles.ts` as JSON. "Report a bug" has no backend |
| 50 | Legal | W | Dates from `app/legal/documents.ts` (serve as JSON so they never drift). The pages open in an in-app browser |

### Draft progress (new; build in Phase 8, then flag it here as done)
- **Definition:** an editing checklist worth 20% each:
  1. Media on the timeline
  2. Trimmed or cut (any clip `in`/`out` ≠ source bounds, or a split)
  3. Captions added
  4. Audio set (music, voiceover or level change)
  5. Text or title added
- **Implementation:** a pure function `draftProgress(editorDoc)` in `lib/editor/`, computed server-side and returned by the projects list and detail endpoints. **No migration.** AutoClip drafts compute the same score from their `editorDoc`.
- **Tests:** unit tests over sample `TimelineDoc`s.

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

## 4. Decisions (2026-10-01) and remaining risks

### Decided by the user
| Topic | Decision |
|---|---|
| Removed products | Text, Script and Image-to-Video, AI Avatar, Split Screen and My Avatars are **removed from the mobile design** |
| TikTok | **Removed everywhere** (not available in India). Platforms: YouTube, Instagram, Facebook |
| Publishing | **YouTube Shorts in v1**; Instagram and Facebook later (shown as "Soon") |
| Billing | **Phase 12.** No Razorpay checkout in the app; plans and packs are read-only until then |
| OTP | 6 digits |
| AutoClip limits | Plan-based, from `api/upload-policy` |
| Draft progress | Build it (§2) |
| Voice cloning | **In v1.** The ElevenLabs plan will be upgraded |
| Render queue in prod | `RENDER_QUEUE_DRIVER=in-process` (confirmed from the Hostinger env) |
| Hostinger | App settings: Framework Next.js, **Root directory `./`**, Build and output settings: Default, **Node 22.x**, branch `main`. Root directory is an editable setting |

### Billing: recommendation for Phase 12
Credits and plans are digital goods, so Google Play requires Play Billing.
- **India:** User Choice Billing lets Razorpay appear **alongside** Play Billing (never instead of it). Google's fee is then 4 points lower on the Razorpay transactions.
- **Linking out:** Google's external-link / alternative-billing programme reaches the rest of the world, including India, only by **30 Sep 2027**. Until then, linking users out to buy on the web isn't allowed.
- **Recommended:**
  1. **Launch:** read-only plans, packs and balances (done in the design). No buy buttons, no "buy on web" links. Zero fee, zero policy risk.
  2. **Phase 12:** add Play Billing, with the server verifying each purchase (Play Developer API) before it grants credits or plans. Add Razorpay via User Choice Billing only if the 4-point saving is worth a second checkout.
- **Sources:**
  - [Play Console Help: India billing changes](https://support.google.com/googleplay/android-developer/answer/13306652?hl=en)
  - [User choice billing](https://support.google.com/googleplay/android-developer/answer/13821247?hl=en)
  - [Android Developers Blog, Mar 2026](https://android-developers.googleblog.com/2026/03/a-new-era-for-choice-and-openness.html)

### Editor toolbar (decided with the design revision)
- **Media** opens the new Media sheet (Assets / Upload / Stock).
- **Filters** and **Transitions** open the Effects panel on that tab.
- **Image** (merged into Media) became **AI Tools**, which had no toolbar button before.
- The panel tab strip gained Media.

### Remaining risks
**R1. Phase 1 monorepo vs the Hostinger deploy.** This is the highest risk.
- **Hostinger settings:** Root directory is editable (`./` today), and the build uses Hostinger's *default* commands. There are two options:
  - (a) Set the root to `apps/web`.
  - (b) Keep `./` and have the root `package.json` delegate `build` and `start` to the web workspace.
  - Option (b) doesn't depend on how Hostinger resolves a lockfile outside its root, and it is easier to roll back. Phase 1 will pick one after a dry run.
- **Things that assume the repo root:**
  - `scripts/postbuild.js` hardcodes `/home/u154310472/domains/clipiro.com/public_html` and `../public_html`.
  - `next.config.ts` uses `turbopack.root: __dirname` and `workerThreads` (#261).
  - The standalone output path moves in a monorepo (`.next/standalone/apps/web/server.js`).
- **Package manager:** npm → pnpm changes the `node_modules` layout, which Next's standalone tracing, Prisma and the ffmpeg `postinstall` all depend on. **Recommend npm workspaces** unless you want pnpm.
- **Install time:** mobile (Expo) dependencies must not be installed by the web deploy. A deploy already takes about 13 minutes.
- **Node versions:** Hostinger builds on **Node 22**, but CI uses Node 20. Align CI to 22 in Phase 1.

**R3. The tool job model.** Tool jobs are in-memory (`lib/job-routes.ts`), and prod also runs the **in-process render queue**. So every deploy or restart kills in-flight AutoClip renders and tool jobs. The watchdog refunds AutoClip; tool jobs are just lost.
- A DB-backed job status (extend `Generation` or add a `Job` table) is required before the app relies on "POST job → poll → push" (Phase 5).
- Completion push must also fire from the refund/failure path.

**R5. Provider limits.** Voice cloning needs the ElevenLabs upgrade to land before Phase 12. Submagic stays inactive without a key.

**R6. Social publishing.** YouTube upload exists. Instagram and Facebook publishing need `instagram_content_publish` / `pages_manage_posts` and Meta app review. SCHEDULING.md (Phase 11) comes first.

**R8. Push.** Needs FCM (a Firebase project and `google-services.json`), a `DeviceToken` table, and a hook in `notify()`.

**R10. AI Assistant.** There's no Anthropic key in env yet, and pricing (per message or per action) still needs deciding.

**R11. Editor scope and performance.** A 60 fps native timeline, with the same `TimelineDoc` as the web.

### Still open (not blocking Phase 1)
1. pnpm (as the playbook says) or npm workspaces (recommended)? Phase 1 plan.
2. AI Assistant pricing and the Anthropic key (Phase 13).
