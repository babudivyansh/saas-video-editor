# Scheduling and posting — backend design (mobile Phase 11)

Status: **APPROVED 2026-10-10** with every recommended option: D1 A, D2 A,
D3 A, D4 A, D5 A (see §4). Built in Phase 11.3 (backend) and 11.4 (app).

The app's Social Studio (design: Calendar, Composer, Scheduled posts, Accounts)
lets a creator pick a clip, write a caption, choose where and when, and have
Clipiro post it. This document says what the server needs for that, starting
from what the web already has.

## 1. What already exists (web)

| Piece | Where | What it does today |
|---|---|---|
| `ClipPublish` table | `prisma/schema.prisma` | One row per (clip × social account). Statuses `pending · publishing · linked · failed · awaiting_manual · expired`, `scheduledFor`, `publishedAt`, `permalink`, `providerPostId`, `failureReason`, cached `metricsJson`. |
| Publish route | `app/api/projects/[id]/clips/[clipId]/publish` | GET: the user's accounts and a clip's publish rows. POST: **YouTube** → uploads now (unlisted) or stores a future `scheduledFor`; **Instagram/Facebook** → manual flow (the user posts, then pastes the permalink). A row lock + "publishing" claim stops double uploads. |
| Scheduler | `lib/clip-scheduler.ts`, cron `/api/cron/clip-publish` every 10 min (in `lib/cron-schedule.ts`, so prod's `/api/cron-tick` runs it) | Due YouTube rows are uploaded; due Meta rows become `awaiting_manual`; rows more than 24 h late become `expired`; stale `publishing` claims (2 h) are released. |
| YouTube upload | `lib/social/google.ts` `uploadVideo` | Resumable upload, title ≤ 100, description ≤ 5,000, privacy (default unlisted). Scope `youtube.upload` is already requested; accounts connected before it existed get `needs_reauth` on first upload. |
| Meta | `lib/social/meta.ts` | **Read-only scopes.** No publishing code. |
| OAuth connect | `app/api/social/connect/[provider]` → provider → `app/api/social/callback/[provider]` | The `state` is a signed JWT carrying the user id (no cookie needed); the callback redirects to the web dashboard. |
| Metrics loop | `lib/social/refresh-queue.ts`, `/api/cron/social-refresh` | Linked posts get their stats pulled into `metricsJson`. |
| Caption ideas | `POST /api/social/captions` | AI caption drafts for an account (not stored). |

So "scheduled posts" exist, but only per clip, without a caption or
hashtags, without a per-user list, and with no way to edit or cancel one.

## 2. What the app needs that is missing

1. **What gets posted.** A caption and hashtags (YouTube description), a title,
   and visibility. Today the title is the clip's title, the description is the
   fixed "Published via Clipiro AutoClip", and visibility is always unlisted.
2. **One list across clips.** The Calendar and Scheduled screens list every
   post of the user's, by date — not one clip at a time.
3. **Change and cancel.** Move a scheduled post, edit its caption, or delete it
   while it hasn't started.
4. **Posting more than clips.** The editor's Export → "Post" (Phase 9.3) has a
   rendered video that isn't a `Clip`.
5. **Connecting accounts from the phone.** The OAuth callback must come back
   to the app, not the web dashboard.
6. **Telling the person.** Posted, failed, needs reconnecting, or "time to post
   it yourself" (Meta) should reach the phone.

## 3. Proposed design

### 3.1 Data — extend `ClipPublish`, don't add a second table

One table keeps the web's per-clip view, the scheduler, the claim and the
metrics loop working unchanged. New nullable columns (one migration):

| Column | Type | Why |
|---|---|---|
| `userId` | `String` (FK User, indexed with `scheduledFor`) | The per-user list without joining through Clip → Project; also the owner check for a row that has no clip. Backfilled from clip → project → user. |
| `assetId` | `String?` (FK Asset, `onDelete: SetNull`) | Post an editor export saved in Assets (Phase 9.3 "Save to Assets"). Exactly one of `clipId` / `assetId` is set (CHECK constraint); `clipId` becomes nullable. |
| `title` | `String?` (≤ 100) | YouTube title. Null = the clip's title (today's behaviour). |
| `caption` | `String?` (≤ 5,000) | Description / caption text. |
| `hashtags` | `String[]` (≤ 30) | Kept apart so the app can edit them; appended to the description when posting. |
| `privacy` | `String` default `"public"` for new app posts (`public · unlisted · private`) | The web route keeps sending `unlisted`; see decision D3. |
| `source` | `String` default `"web"` (`web · app`) | Which client created it, for support and analytics. |

Statuses stay as they are. The app shows them as:
`pending + scheduledFor` → **Scheduled**, `publishing` → **Posting**,
`linked` → **Posted**, `failed` → **Failed** (with `failureReason`),
`awaiting_manual` → **Your turn to post**, `expired` → **Missed**.

### 3.2 API (`/api/mobile/v1/social/posts`, Bearer auth, subscriber-only like the rest of Social)

| Route | Does |
|---|---|
| `GET /social/posts?from=&to=&status=` | The user's posts in a date range (Calendar month, Scheduled list), with clip/asset title + thumbnail and the account. Cursor-paged. |
| `POST /social/posts` `{ source: {clipId}|{assetId}, accountIds[], title?, caption, hashtags[], privacy, when: "now"|ISO }` | One row per account. YouTube + now → uploads in the background (returns rows as `publishing`, not a 60-second request). YouTube + later → `pending`. Meta → `pending` with the manual flow (see D1). Validates: clip ready / asset ready video, ≤ 3 min and vertical for Shorts (warn, not refuse, for other shapes — see D4), time ≥ 5 min ahead and ≤ 90 days. |
| `PATCH /social/posts/:id` `{ title?, caption?, hashtags?, privacy?, scheduledFor? }` | Only while `pending`. |
| `DELETE /social/posts/:id` | Only while `pending` (cancel), or any finished row (removes it from Clipiro; never deletes the platform's post). |
| `POST /social/posts/:id/retry` | `failed` / `expired` → `pending` now. |
| `POST /social/posts/:id/link` `{ permalink }` | The manual flow's "I posted it": the web's `resolveProviderPostId`, status `linked`. |
| `POST /social/captions` | The web's caption ideas, for the Composer's "Suggest". |

The web routes keep working; the shared logic (claim, upload, permalink
resolve) moves from the route into `lib/social/publish.ts` so both call it.

### 3.3 Posting worker

- **Now** posts don't upload inside the request (a phone on mobile data
  waits ~1 min otherwise). The row is created `publishing` with `scheduledFor =
  now` and the existing cron picks it up within 10 minutes — or, better, the
  route enqueues it on a new `social-publish` queue built with the existing
  `createRenderQueue` (`lib/render-queue.ts`, in-process driver in prod), and
  the cron stays the safety net. Proposal: **enqueue + cron fallback.**
- The cron's 10-minute tick means a scheduled time is "within 10 minutes".
  The app says so ("Posts within 10 minutes of the time").
- The upload streams from S3 to YouTube instead of `readFileSync` of the whole
  file (today's code buffers it), so a 100 MB file doesn't sit in memory.
- Claims, lateness window (24 h → `expired`) and stale-claim release are
  unchanged.

### 3.4 Connecting accounts from the phone

- `GET /api/mobile/v1/social/connect/:provider` → `{ url }`, the same
  `buildAuthUrl`, with `client: "app"` added to the signed state.
- The callback, seeing `client: "app"`, redirects to
  `clipiro://social/accounts?connected=youtube` (or `?error=…`) instead of the
  dashboard. The app opens the URL with `expo-web-browser`'s
  `openAuthSessionAsync`, which returns when that redirect happens.
- The provider redirect URI stays the web callback (no new URIs to register).
- "Reconnect" (status `needs_reauth`, or an account without `youtube.upload`)
  is the same flow.

### 3.5 Notifications

New types, pushed under a new phone setting **"Posts"** (default on), and in
the bell on the web:
`social_post_published`, `social_post_failed`, `social_post_needs_reconnect`,
`social_post_your_turn` (Meta manual). Tapping opens the post in the app.

### 3.6 Limits and risks

- **YouTube API quota — the big one.** An upload costs 1,600 units; the
  default project quota is 10,000 units/day, i.e. **about 6 uploads per day for
  all users together**. Before launch the Google Cloud project needs a quota
  increase (Google's audit form). Until then: a global daily cap with a clear
  "Posting is busy today — it'll go out tomorrow / post it yourself" fallback,
  and a per-user cap (proposal: 10 a day).
- **Google verification.** `youtube.upload` is a sensitive scope; until the
  OAuth app is verified, new connects see Google's "unverified app" warning.
- **Meta publishing** needs `instagram_content_publish` / `pages_manage_posts`,
  Meta App Review and business verification — weeks, outside the code. See D1.
- **Shorts.** YouTube decides what's a Short (vertical, ≤ 3 min). The app
  warns when a video isn't; it doesn't add "#Shorts" unless the user does.
- Subscriber-only: posting follows Social Tracker's paid gate (402
  `subscription_required`).

## 4. Decisions needed

- **D1 — Instagram and Facebook.**
  **A (recommended):** YouTube posts automatically; Instagram/Facebook get the
  manual flow — at the time, a push says "time to post", the app opens the
  share sheet with the video and the caption copied, and the person pastes the
  link back (or the next sync finds it). Real Meta publishing is a later
  project (scopes + App Review). **B:** YouTube only; Instagram/Facebook can't
  be picked in the Composer. **C:** start Meta App Review now and build Meta
  publishing in this phase (blocked on Meta's timeline).
- **D2 — Editor exports.** **A (recommended):** posts can come from a clip or
  from a video in Assets (the `assetId` column). **B:** clips only for now.
- **D3 — Default visibility for app posts.** **A (recommended):** Public, with
  the choice in the Composer (Public / Unlisted / Private); the web keeps
  unlisted. **B:** unlisted everywhere, as today.
- **D4 — Non-Short videos to YouTube.** **A (recommended):** allowed, with a
  warning that it will be a regular video. **B:** refused.
- **D5 — Quota guard.** **A (recommended):** per-user cap of 10 posts a day plus
  a global daily cap set from the project's quota (env), with the fallback
  above; request the quota increase before launch. **B:** no caps until the
  quota is raised.

## 5. Build order (after approval)

1. Migration + `lib/social/publish.ts` (moved from the web route, web route
   uses it) + streaming upload + the queue job. Web behaviour unchanged.
2. `/api/mobile/v1/social/posts*`, `/social/captions`, `/social/connect` +
   the callback's app redirect. Tests for ownership, state changes, caps.
3. Notifications + the "Posts" push setting.
4. App: Accounts (connect/reconnect), Composer, Calendar, Scheduled — live.

## 6. As built (Phase 11.3)

Backend done as above, with these differences from §3:

- **One source, not "exactly one".** The CHECK is `clipId IS NULL OR assetId
  IS NULL`. `assetId` is `SET NULL` on delete, so "exactly one" would have made
  deleting a posted video fail; instead a finished post keeps its link and
  numbers after its video is deleted, and a pending one fails with "the video
  was deleted". New posts always set one.
- **"Now" posts are created `pending` with `scheduledFor = now`**, not
  `publishing`: the queue job (`social-publish`, `lib/social/publish-queue.ts`)
  and the cron take the same pending → publishing claim, so whichever runs
  first posts it once. The app shows a due pending YouTube post as Posting.
- **Instagram/Facebook "now"** is `awaiting_manual` straight away (no push:
  the person is in the app); a scheduled one becomes `awaiting_manual` with a
  "your turn" push when its time comes.
- **Quota guard.** `SOCIAL_YOUTUBE_DAILY_UPLOADS` (default 6) is a Redis
  counter per Pacific day, taken just before an upload. When it's used up the
  post stays pending and goes out on a later tick (after midnight Pacific);
  past the 24 h window it is Missed. Creating a "now" post on a full day
  returns the warning `uploads_busy`. `SOCIAL_POSTS_PER_USER_DAY` (default 10)
  counts posts created in the last 24 h, one per account (429 `post_limit`).
- **Times:** at least 5 minutes ahead, at most 90 days. Captions to Instagram
  or Facebook stop at 2,200 characters, YouTube at 5,000; up to 30 hashtags.
- **Missed and stuck posts** (`expired`, and stale `publishing` claims now
  failed) carry a `failureReason` and send the "failed" push.
- **The push switch** is the existing `postPublished` preference, shown as
  "Posts" in Settings, on a new Android channel "posts". Notifications link to
  `/dashboard/social-tracker?post=<id>`, which the app opens as
  `/social/scheduled-posts?post=<id>`.
- **Routes:** `GET|POST /social/posts`, `GET|PATCH|DELETE /social/posts/:id`,
  `POST /social/posts/:id/retry`, `POST /social/posts/:id/link`,
  `POST /social/captions`. Shapes: `socialPostSchema` and friends in
  `packages/shared/src/schemas/social.ts`.
