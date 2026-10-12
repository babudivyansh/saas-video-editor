# Releasing the Android app (mobile Phase 15)

How to take Clipiro for Android from this repo to Google Play. Decisions:
R1–R5 all A. That means Sentry for crash reports, first-party analytics only,
an **organisation** Play developer account (production opens without the
12-tester closed test that new personal accounts must run), version codes
kept by EAS, and EAS Update for JavaScript fixes.

Steps marked **(you)** need your accounts, your money or your signature;
nothing in this repo can do them. Everything else is already configured
(`apps/mobile/eas.json`, `app.json`, `app.config.js`).

---

## 0. Release blockers (fix before the first production release)

| # | Blocker | Why it blocks | Who |
|---|---|---|---|
| B1 | **Privacy policy is out of date.** `app/privacy/page.tsx` "Linked Social Accounts" says Clipiro requests "read-only analytics permissions only" and "cannot post". It asks for YouTube's `youtube.upload` and posts videos for the person (the web's AutoClip publish, and the app's Composer since Phase 11). It also says nothing about the Android app's data: push tokens, crash reports, aggregate app analytics, AI Assistant messages processed by Google Gemini, voice samples sent to ElevenLabs. | Play's Data safety form and Google's OAuth verification of `youtube.upload` both check the policy against what the app does | **(you)** approve wording; the draft is in §9 |
| B2 | **No public "delete my account" page.** Play requires a web link where someone can request deletion without installing the app. The privacy policy only mentions the right. The app itself deletes accounts (You → Settings → Delete account). | Play's account-deletion requirement | **(you)** approve; a small page at `/delete-account` (draft in §9) |
| B3 | **Server not deployed.** The app talks to `https://clipiro.com/api/mobile/v1`, which exists only once PRs #286–#333 are merged and deployed, with the migrations in §2 applied. | Every screen | **(you)** merge and deploy |
| B4 | **Google sign-in on Android needs an Android OAuth client.** | "Continue with Google" fails without it | **(you)** §1.4 |
| B5 | **Photo & video permission declaration.** The app declares `READ_MEDIA_VIDEO` (expo-media-library, to save exports into a "Clipiro" album). Play asks apps holding it to justify it, or to use the photo picker. | Review may reject | **(you)** fill the declaration (§4.6). If it's refused, the fallback is to save without the album, which needs no read permission (a small code change) |

---

## 1. One-time setup

### 1.1 Accounts (you)

- **Google Play Console developer account**, organisation type: a $25 one-time fee, a D-U-N-S number, and identity and organisation verification. Verification can take days, so start it first.
- **Expo account** with an organisation for Clipiro. EAS Build and Update work on the free plan with queues; the paid plan builds faster.
- **Sentry:** a React Native project in the same organisation as the web (`SENTRY_ORG`), plus an auth token with `project:releases` scope for source-map upload.
- **Firebase project** for push notifications (FCM), with an Android app registered as `com.clipiro.app`.

### 1.2 Link the repo to EAS (you)

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest init
```

`init` creates the Expo project and writes its id to `app.json`
(`extra.eas.projectId`). Commit that change: it turns on EAS Update's URL
and push tokens (`app.config.js`).

### 1.3 EAS environment variables (you, on expo.dev → Project → Environment variables)

Set these for the **preview** and **production** environments. `eas.json` already sets the API URL and app environment per profile.

| Name | Visibility | Value |
|---|---|---|
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | plain text | The web OAuth client id (public; same as the web's `GOOGLE_CLIENT_ID`) |
| `EXPO_PUBLIC_SENTRY_DSN` | plain text | The Sentry project's DSN. Leave unset to keep crash reporting off |
| `SENTRY_ORG`, `SENTRY_PROJECT` | plain text | Turn on source-map upload during the build |
| `SENTRY_AUTH_TOKEN` | **secret** | The Sentry token |
| `GOOGLE_SERVICES_JSON` | **secret file** | Firebase's `google-services.json` |

Push also needs the FCM credentials on EAS: run `npx eas-cli@latest credentials`, then Android → production → upload the Firebase **service account key (FCM V1)**.

### 1.4 Google sign-in for Android (you)

In the Google Cloud project that owns the web OAuth client:

1. Create an **Android** OAuth client: package `com.clipiro.app`, with the SHA-1 of the **app signing key**. That key is in Play Console → Test and release → App integrity, once the first bundle is uploaded.
2. Add a second Android client with the SHA-1 of EAS's **upload key** (`eas credentials`), so internal APKs work too.
3. Put its id in the server env as `GOOGLE_ANDROID_CLIENT_ID`. The server checks the token's audience.

### 1.5 Server settings for the app (you, on the production host)

| Env | For |
|---|---|
| `EXPO_ACCESS_TOKEN` | Sending pushes through Expo, if push security is enabled on the Expo project |
| `GEMINI_API_KEY` | Clipiro AI (already used by the web's AI features) |
| `GOOGLE_ANDROID_CLIENT_ID` | Google sign-in from the app (§1.4) |
| `SOCIAL_YOUTUBE_DAILY_UPLOADS` | YouTube posting cap, default 6. Raise it once Google raises the quota |
| `SOCIAL_POSTS_PER_USER_DAY` | Posts per person per day, default 10 |
| `VOICE_CLONING_ENABLED` | `true` only after ElevenLabs is on a plan with Instant Voice Cloning |

---

## 2. Before the first build: the server (you)

1. Merge PRs #286–#333 in order (they're stacked), and deploy.
2. Apply the migrations (`npx prisma migrate deploy` against production), the mobile-era ones being:
   `20261006120000_generation_result`, `20261006120000_asset_size_bigint` (#303), `20261008120000_device_token`, `20261009120000_device_push_prefs`, `20261010120000_social_posts`, `20261012120000_assistant_messages`, `20261012130000_app_event_daily`.
3. Check `https://clipiro.com/api/health`.

---

## 3. Build and try it

```bash
cd apps/mobile
npx eas-cli@latest build --profile preview --platform android
```

Install the APK from the link EAS gives (phone or emulator). Then run the checks Phase 14 left for a device (`docs/mobile/QA.md` §6):

- **Maestro flows:** `maestro test .maestro/signup-autoclip-download.yaml` and `.maestro/edit-export.yaml`. They work against the preview build too; leave the spending flags off.
- **TalkBack** on: walk Home → AutoClip → a project → a clip → the editor → Export, then Social, then You.
- **Font size** at its largest (Settings → Display): check the same screens for clipped text.
- **Cold start** time, scrolling in Projects and Assets, and playing a clip preview.
- **Push:** finish an AutoClip run with the app in the background. The notification should arrive and open the project.

---

## 4. Play Console (you)

### 4.1 Create the app

- Name **Clipiro**, default language English (US), App, Free, and the declarations.
- Package `com.clipiro.app`: it's set by the first upload.

### 4.2 Production build and upload

```bash
npx eas-cli@latest build --profile production --platform android
npx eas-cli@latest submit --profile production --platform android
```

`submit` sends the bundle to the **internal testing** track as a draft (`eas.json`). The first upload can also be made by hand in Play Console → Internal testing → Create release, which also enrols Play App Signing (accept it).

### 4.3 App content

| Section | Answer |
|---|---|
| Privacy policy | `https://clipiro.com/privacy` (after B1) |
| App access | "Some functionality is restricted." Give reviewers a **paid test account** (email and password), so they can see Social and Insights. Say that sign-up needs an emailed code, which is why the login is provided |
| Ads | No ads |
| Content rating | Questionnaire: category "Utility, Productivity, Communication, or Other". No violence, sexual content, drugs or gambling. User-generated content: **yes** (people upload their own video), but it isn't shared between users inside the app. No location sharing. No purchases inside the app. Expected rating: Everyone / PEGI 3 |
| Target audience | **18 and over** (and not "appeals to children"). Clipiro is a creator tool tied to paid plans and social accounts |
| News app | No |
| Data safety | §4.4 |
| Government app, Financial features, Health | No / None / None |
| Account deletion | In-app path: You → Settings → Delete account. Web link: `https://clipiro.com/delete-account` (B2) |

### 4.4 Data safety

Collected = sent off the phone. Nothing is **sold** or **shared** with third parties for their own use. The processors (AWS S3, Google Gemini, ElevenLabs, Sentry, Expo push, YouTube and Meta APIs on the person's request) act for Clipiro, which Play doesn't count as sharing. Data is encrypted in transit (HTTPS). People can ask for deletion (in-app, and B2).

| Data type | Collected | Linked to the person | Optional? | Purposes |
|---|---|---|---|---|
| Personal info → Name | Yes | Yes | Required | Account management |
| Personal info → Email address | Yes | Yes | Required | Account management, App functionality, Developer communications |
| Personal info → Other info (connected social account names and their stats) | Yes | Yes | Optional | App functionality |
| Financial info → Purchase history (plans bought on the web, shown with invoices) | Yes | Yes | Optional | App functionality, Account management |
| Photos and videos | Yes | Yes | Optional | App functionality |
| Audio files (uploads, voiceovers, voice samples for cloning) | Yes | Yes | Optional | App functionality |
| Files and docs (brand kit logo, other uploads) | Yes | Yes | Optional | App functionality |
| Messages → Other in-app messages (Clipiro AI chat, support messages) | Yes | Yes | Optional | App functionality, Customer support |
| App activity → App interactions (5 events counted per day: open, sign-up, AutoClip, export, post) | Yes | **No** (no user or device id stored) | Required | Analytics |
| App info and performance → Crash logs, Diagnostics (Sentry, no personal data) | Yes | No | Required | App functionality, Analytics |
| Device or other IDs (push token) | Yes | Yes | Optional (notifications) | App functionality |

Not collected: location, contacts, calendar, SMS or call logs, health, web browsing, phone number.

### 4.5 Store listing

**App name** (30 max): `Clipiro: AI Video Clips`

**Short description** (80 max):
`Turn long videos into short, captioned clips. Edit, schedule and post.`

**Full description:**

> Clipiro turns your long videos into short clips that are ready to post.
>
> **AutoClip.** Upload a podcast, stream or talk, or paste a link. Clipiro finds the strongest moments, reframes them to 9:16 and adds animated captions. Every clip gets a virality score, so you know which to post first.
>
> **Edit on your phone.** Trim, add media, captions, audio, text and effects, then export in 1080p on a paid plan.
>
> **AI tools.** Images, voiceovers, a voice changer, speech enhancement, vocal removal, background removal, face swap and a subtitle remover.
>
> **Post and schedule.** Schedule clips to YouTube and Clipiro posts them for you. For Instagram and Facebook, it reminds you when it's time, copies your caption and keeps track once you post.
>
> **Insights.** Connect YouTube, Instagram and Facebook to see views, followers, your audience's best times to post, competitors and reports in one place.
>
> **Clipiro AI.** Ask for the best hooks in a project, a caption for a clip, or when to post, and act on the answer in a tap.
>
> Your projects, clips and assets are the same on the web at clipiro.com.

**Category:** Video Players & Editors. **Contact:** support@clipiro.com, https://clipiro.com.

**Graphics:**
- App icon 512×512 (from `assets/icon.png`).
- Feature graphic 1024×500.
- Phone screenshots: 4 to 8, 1080×1920 (9:16), on the dark theme. Suggested:
  1. Home (balances, top clips)
  2. AutoClip setup (source, length, captions)
  3. A project's clips with virality scores
  4. The editor timeline
  5. Composer (scheduling a post)
  6. Insights overview
  7. Clipiro AI with a hooks card
  8. Brand Kit or AI Media

  Take them from the preview build on a Pixel-size emulator, with the demo account's data.

### 4.6 Sensitive permissions

| Permission | Why (for the declaration) |
|---|---|
| `POST_NOTIFICATIONS` | Tells people when their clips are rendered, an export is ready, or a post went out (they can turn each off in Settings) |
| `READ_MEDIA_VIDEO` | Saves rendered clips and exports to a "Clipiro" album in the gallery. The app is a video editor; the person picks videos to edit through the system document picker. (B5) |
| `READ/WRITE_EXTERNAL_STORAGE` (Android 12 and below) | The same saving and picking, on older Android versions |
| `INTERNET` | Everything talks to clipiro.com |

Camera, microphone, overlay, image and audio media, and media location are blocked in `app.json`.

---

## 5. Releasing

Organisation account, so production opens straight after review.

1. **Internal testing** (up to 100 testers, by email list): the build from §4.2. Install from the Play opt-in link, and repeat the §3 checks on the Play-signed build. Google sign-in uses the app signing key (§1.4).
2. **Production:** promote the same release. Use a **staged rollout**: 10%, then 50% after a day with no new crash in Sentry, then 100%.
3. **Review:** the first review can take several days. Answer any policy questions in Play Console → Inbox.

Each new native build gets the next version code automatically (EAS, `autoIncrement`). Raise `version` in `app.json` for people-facing releases (1.0.1, 1.1.0).

---

## 6. JavaScript fixes without a new build (EAS Update)

When a fix touches only JavaScript, not native modules or `app.json` native settings:

```bash
cd apps/mobile
npx eas-cli@latest update --channel production --environment production --message "Fix: <what>"
```

Installed builds fetch it on their next launch. `runtimeVersion` uses the **native fingerprint**: if a change does alter native code, EAS gives it a new runtime version and the update won't reach old builds. That's the signal a store build is needed. Test on the `preview` channel first (`--channel preview`, installed preview APKs).

To roll back: `npx eas-cli@latest update:republish` with the previous update's group, or publish the reverted code.

---

## 7. After launch

- **Sentry:** watch new issues, especially from the first staged-rollout step.
- **Analytics:** the `AppEventDaily` table holds counts per day and version.
- **Play Console:** Android vitals (ANRs, crashes), reviews, pre-launch report.
- **YouTube API quota:** request the increase before posting traffic grows (§8).

---

## 8. Everything still owed, from every phase

| Item | From | Who |
|---|---|---|
| Release blockers B1–B5 (§0) | 15 | you |
| Device checks: Maestro runs, TalkBack, large fonts, startup and scrolling (`QA.md` §6) | 14 | you run the build; the checks can then be done |
| Firebase project and `google-services.json`; FCM key on EAS | 7 | you |
| Android OAuth client for Google sign-in | 6 | you |
| **YouTube API quota increase** (about 6 uploads a day app-wide on the default quota) | 11 | you (Google's audit form) |
| **Google OAuth verification** of `youtube.upload` (until then, new connects see "unverified app") | 11 | you (needs B1 first) |
| Meta App Review, only if Instagram/Facebook posting is ever automated (today it's the manual "your turn" flow) | 11 | later |
| ElevenLabs plan with Instant Voice Cloning, then `VOICE_CLONING_ENABLED=true` and `ELEVENLABS_MAX_VOICE_SLOTS` | 12 | you |
| Play Billing, if app users often run out of credits (`BILLING.md` option B) | 12 | later |
| `npm audit` in `apps/mobile`: 69 reported issues, mostly in build-time tooling. Triage before release; don't `--force` | 15 | review |
| Prod `migrate deploy` (§2) and merging the stack | 5–15 | you |

---

## 9. Drafts for B1 and B2 (approve before publishing)

**B1. Privacy policy: replace the first paragraph of "Linked Social Accounts" with:**

> If you use the Social Tracker or Social Studio, you may link your YouTube, Instagram or Facebook accounts through each platform's official sign-in. For all three we read your analytics. For **YouTube**, you can also let Clipiro upload videos you choose to your channel, now or at a time you schedule (the `youtube.upload` permission). We never post anything you didn't ask us to. For Instagram and Facebook, Clipiro doesn't post: it reminds you to, and you post yourself. We can't send messages, delete your content, or read your direct messages.

**…and add a section "The Clipiro Android app":**

> The app uses the same account and data as clipiro.com. In addition, it stores a push-notification token for your phone (to tell you when clips are ready or a post went out; you can turn these off in Settings), sends crash reports to Sentry (without your name, email or IP address), and counts a few in-app events per day (opening the app, signing up, starting AutoClip, exporting, posting) without recording who did them. Messages you send to Clipiro AI are processed by Google Gemini to answer you, and are kept for 90 days or until you start a new chat. Voice samples you upload for voice cloning are sent to ElevenLabs to create your voice.

**B2. `/delete-account` page:**

> **Delete your Clipiro account.** In the app: You → Settings → Delete account, then confirm with your password (or with a code we email you, if you signed up with Google). On the web: Settings → Danger zone → Delete account. Your account is switched off at once and deleted for good after 30 days, with your projects, clips, assets, posts and connected-account data, unless you sign back in before then. Any paid plan is cancelled. If you can't sign in, email support@clipiro.com from your account's address and we'll delete it for you.
