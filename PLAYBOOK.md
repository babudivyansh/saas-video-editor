# Clipiro Android — build playbook for Claude Code

How to use this file:
- Put this handoff folder's contents at the root of the clipiro repo (see README.md).
- Paste the prompts below into Claude Code **one phase at a time**, in order.
- Every phase starts in plan mode. Read the plan, approve it, then let it build.
- At the end of every phase Claude Code must run the checks listed and report back. Commit when they pass.
- If something looks wrong, send a screenshot of the app next to the file in `design/png/` and say "match this".

Rules Claude Code follows every time are in `CLAUDE.md`. Screen list, routes and data are in `design/SCREENS.md`.

---

## Phase 0 — Understand the project (no code)

```
Read CLAUDE.md, PLAYBOOK.md, design/SCREENS.md and look through design/screens and design/png.
Then explore this repository: the Next.js app, how auth works, the database/ORM, how AutoClip jobs,
uploads, credits, captions, AI tools and the social tracker are implemented, and which env vars exist.
Write docs/mobile/ARCHITECTURE.md covering:
1. What exists today (with file paths) for each area in SCREENS.md.
2. Which mobile screens can reuse existing backend logic and which need new backend work
   (scheduling/composer, voice cloning, push and draft progress are new).
3. The auth approach for mobile (Bearer tokens) based on what the web app uses today.
4. Risks and open questions for me.
Do not change any code in this phase.
```
Check: you read ARCHITECTURE.md and answer its open questions before continuing.

---

## Phase 1 — Monorepo

```
Plan first. Convert this repo into a pnpm workspace monorepo:
- Move the current Next.js app to apps/web with zero behaviour changes (keep env files, scripts, config paths working).
- Create packages/shared (TypeScript) and move packages/shared/tokens.ts into it with an index export.
- Add root scripts: dev:web, dev:mobile, build, lint, typecheck, test.
- Update CI/deploy config so the web app still deploys from apps/web.
Verify: pnpm install, pnpm --filter web build, pnpm --filter web dev start cleanly, typecheck passes.
Report exactly what moved and anything I must change in my hosting settings.
```
Check: website runs locally and builds exactly as before. Commit.

---

## Phase 2 — Mobile app skeleton + design system

```
Plan first. Create apps/mobile with Expo (latest SDK), Expo Router and TypeScript strict.
- Install: react-native-svg, expo-image, expo-font, expo-secure-store, @tanstack/react-query, zustand,
  react-native-reanimated, react-native-gesture-handler, @shopify/flash-list, expo-haptics.
- Load Geist and Geist Mono with expo-font. Dark theme only, background from tokens.
- Build shared components in apps/mobile/components using ONLY packages/shared tokens, matching
  design/screens pixel values (412pt design width):
  Button (primary lime / secondary / ghost / danger, loading + disabled), IconButton, TextField
  (label, leading icon, trailing action, focus ring, error, helper), Chip/FilterPills, SegmentedControl,
  Toggle, Checkbox, Avatar, StatTile, ScoreRing (with icon variant), ProgressBar, StatusBadge,
  Card/Tile, SectionHeader, ListRow, BottomSheet, EmptyState, Skeleton, Toast, floating pill TabBar,
  Header (back button + title + actions), CreditsPill.
- Every component: accessibilityRole/label, 44pt minimum touch (hitSlop), supports font scaling.
- Add /dev/components screen showing every component and state.
Verify: npx expo start runs, typecheck and lint pass, add unit tests for Button, TextField, Toggle.
```
Check: open the app in Expo Go or the Android emulator, compare /dev/components with the designs. Commit.

---

## Phase 3 — Navigation shell for all 50 screens

```
Plan first. Using design/SCREENS.md, create every route with Expo Router:
- (onboarding) stack: splash → welcome → generate → create → grow
- (auth) stack: login, sign-up, otp, forgot-password
- (tabs) with the floating pill TabBar: home, projects, create, social, you
- Nested screens under each tab as listed in SCREENS.md.
- Full-screen modals: editor (+ panels as bottom sheets), export, composer, assistant.
Each screen: correct title, header/back behaviour, and a placeholder that names its design file.
Match the links between screens that the designs have (e.g. OTP → Home, Tools "All", Create hub tiles).
Verify: every route opens, back navigation works, Android hardware back works, typecheck passes.
Output a table of route → design file → status.
```
Check: tap through the app like Play mode on the canvas. Commit.

---

## Phase 4 — Static UI for every screen (mock data)

Run this once per section, in order: Launch & Auth → Home → Create → Editor → Projects → Assets → Insights → Social Studio → You.

```
Plan first. Build the [SECTION] screens exactly as in design/screens/[FILES] (see design/SCREENS.md),
using only the shared components. Use typed mock data from apps/mobile/mocks that matches the shapes we
will get from the API (define zod schemas in packages/shared/schemas first).
Include loading skeletons, empty states and error-with-retry states for every data area.
Scrolling screens scroll; bottom bars and the tab bar never cover content.
Verify against design/png/[FILES] and list any differences you could not match.
```
Check: screens look like the designs on a real Android phone, including large font size. Commit per section.

---

## Phase 5 — Mobile API in apps/web

```
Plan first. Add versioned mobile endpoints to apps/web under /api/mobile/v1, reusing existing services
(no duplicated business logic):
- auth: sign up, login, email OTP verify, Google sign-in (ID token exchange), refresh, logout — Bearer tokens.
- me, credits & clip minutes, plans
- projects, clips (list, detail, virality score, status, star, download URL)
- assets (list, folders, favourite, archive, signed upload URL, delete)
- jobs: POST create (autoclip, render/export, ai-image, voiceover, …) → {jobId}; GET /jobs/:id → status/progress/result
- social tracker: accounts, metrics, weekly summary
- notifications, device push token registration
Request/response schemas come from packages/shared/schemas (zod) and are validated on both sides.
Add a typed API client in packages/shared/api. Rate-limit auth routes. Never expose provider API keys.
Write route tests. Don't change the web UI.
```
Check: tests pass, web app unaffected, endpoints work with curl using a test user. Commit.

---

## Phase 6 — Auth for real

```
Plan first. Connect onboarding and auth screens to /api/mobile/v1/auth:
store tokens in expo-secure-store, auto-refresh, redirect logged-in users past onboarding,
email OTP with resend timer, forgot password, Google sign-in via expo-auth-session.
Show inline field errors and friendly network errors. Add tests for the auth flow logic.
```
Check: sign up, verify, log out, log back in, Google sign-in on a device. Commit.

---

## Phase 7 — Core flow: AutoClip end to end

```
Plan first. Make Create → AutoClip real:
- Pick video (expo-document-picker / image picker) or paste link (validate YouTube/Vimeo/Loom/Drive/Dropbox).
- Upload directly to storage with a signed URL, with progress and cancel; resume if the app backgrounds.
- Settings: length, count, aspect ratio, caption style, advanced — show clip-minute cost and balance before starting.
- Start job, show progress, register push token with expo-notifications, notify when clips are ready.
- Project detail: ranked clips with virality score, status, preview (expo-video), star, download to gallery, share.
Handle: insufficient minutes, failed jobs (refund message), offline, file too long/large.
```
Check: full run on a real video from phone to downloaded clip. Commit.

---

## Phase 8 — Home, Projects, Assets with live data

```
Plan first. Replace mocks with the API for Home (stats, recent clips, level/XP, tools), Projects
(All/Drafts/Videos/Reels/Shorts, multi-select actions), Assets (All/Videos/Images/Audio/AI Assets, folders,
favourites, archive, upload, audio preview). Pull-to-refresh, pagination with FlashList, optimistic updates
for star/favourite/archive.
```
Check: data matches the website for the same account. Commit.

---

## Phase 9 — Editor + Export

```
Plan first. Build the editor:
- Preview with expo-video and live caption overlay; timeline with thumbnails, captions and audio tracks; playhead scrubbing.
- Edit state in a Zustand store (undo/redo, split, duplicate, delete), autosaved as a draft to the API.
- Panels as bottom sheets: Captions, Audio, Text, Effects, AI Tools — each writes to the edit state.
- Export: resolution, fps, destination; POST the edit JSON as a render job, show progress, then save/share/post.
The phone never renders the final video; the server does. Keep 60fps scrolling on a mid-range device.
```
Check: edit a clip, export, result matches preview. Commit.

---

## Phase 10 — Other Create tools

```
Plan first. Wire AI Media (image generator with model choice, voiceover, speech enhancer, vocal remover)
and the Create hub AI-tool shortcuts to job endpoints. (Text/Script/Image-to-Video, AI Avatar and Split
Screen were removed from the product on 2026-10-01 — do not build them.)
Show the credit cost before generating; results land in Assets → AI Assets.
Where the backend feature doesn't exist yet, add the endpoint as a stub returning 501 and show a
"Coming soon" state in the app — list these for me.
```
Check: every tool either works or clearly says coming soon. Commit.

---

## Phase 11 — Insights + Social Studio

```
Plan first. Insights (Overview, Content performance, Platform analytics) and Social Studio
(Accounts with health/reconnect, Content calendar, Composer, Scheduled posts) using the social tracker API.
Scheduling/posting is new: design the backend (tables, jobs, platform OAuth, posting workers) in
docs/mobile/SCHEDULING.md first and wait for my approval before implementing it.
Charts with react-native-svg, accessible labels describing each chart.
```
Check: analytics match the website; approve SCHEDULING.md before it's built. Commit.

---

## Phase 12 — You: profile, credits, subscription, settings

```
Plan first. Build You, My Voices (incl. voice cloning), Brand Kit, Credits, Subscription, Notifications,
Settings, Help & Support, Legal with live data.
Payments: research Google Play's current billing policy for digital goods (credits and subscriptions)
in my markets, including India's alternative billing, and write docs/mobile/BILLING.md with the options.
Wait for my decision before implementing purchases. Verify purchases on the server before adding credits.
```
Check: decide the billing approach from BILLING.md. Commit.

---

## Phase 13 — AI Assistant

```
Plan first. Build the AI Assistant chat: streaming responses from a new backend endpoint that calls the
AI model server-side with tools mapped to app actions (find hooks in a project, create clips, write
caption, suggest posting time). Show tool results as cards with action buttons (Review clips, Change style).
Store conversation history per user. Respect credits.
```
Check: ask it to find hooks in a real project and open the result. Commit.

---

## Phase 14 — Quality pass

```
Run a full quality pass and fix what you find:
- Accessibility: every screen with TalkBack, focus order, labels, contrast, 1.3× and 2× font scale, 44pt targets.
- States: offline, slow network, empty account, expired session, job failure.
- Performance: startup time, list scrolling, image memory, video preview.
- Tests: Jest + React Native Testing Library for components and hooks; Maestro E2E flows for
  sign up → AutoClip → download, and edit → export.
- Security: no secrets in the bundle, tokens only in secure store, all endpoints check auth and ownership.
Write docs/mobile/QA.md with results.
```
Check: read QA.md; everything critical fixed. Commit.

---

## Phase 15 — Release

```
Plan first. Prepare release:
- app.json/app.config: name Clipiro, package id, icons, adaptive icon, splash from the design, permissions with reasons.
- EAS: eas.json with development, preview and production profiles; environment variables per profile.
- Crash reporting (Sentry) and analytics.
- Write docs/mobile/RELEASE.md: Play Console setup, Data safety answers based on what the app collects,
  store listing text and screenshots list, internal → closed → production steps, EAS Update for JS fixes.
```
Check: run `eas build --profile preview --platform android`, install the APK, then follow RELEASE.md in Play Console (store accounts and payments are steps you do yourself).
