# Android app — quality pass (mobile Phase 14)

Status: **14.1 done** (code audits and fixes, 2026-10-12). **14.2 to come**:
tests, Maestro flows, and the checks that need a device (TalkBack, large
fonts on screen, startup and scrolling numbers).

Decisions (Q1–Q4 all A): a device run on the dev build that you start; the
Maestro CLI installed here; everything critical or major fixed now, minor
findings listed below; two stages.

Severity: **critical** = data or money at risk, or a screen unusable for some
people; **major** = wrong or missing information, or a control some people
can't use; **minor** = rough edge.

## 1. Accessibility

| Check | How | Result |
|---|---|---|
| Every control has a role and a name TalkBack reads | `src/test/__tests__/a11y.audit.test.tsx`: opens all 51 screens of the real route tree with mock data and inspects every pressable and role-bearing element | Passes. It runs in CI, so a new unlabelled control fails the build |
| 44×44 touch targets | Same test, from each control's style plus `hitSlop` (layout isn't measured under Jest) | Passes after the fixes below |
| Colour contrast (WCAG AA 4.5:1) | `packages/shared/src/tokens.test.ts`: every text colour on every surface, and text on the filled buttons | 46/46 pass. The lowest is `fgSubtle` on `surface3`, still above 4.5 |
| Large fonts (1.3×, 2×) | Code review: text containers use `minHeight`, not fixed heights. Fixed sizes with scaling capped where space is truly fixed (tab bar labels, OTP digits, score rings, avatars) | No fixed-height text box found in the shared components. **Owed: on a device** (14.2) |
| Focus order, TalkBack walkthrough | — | **Owed: on a device** (14.2) |

Found and fixed:

| Severity | Finding | Fix |
|---|---|---|
| major | Small buttons (`Button size="sm"`, 40 high) were under 44: Home "Details", every sheet's small actions | `hitSlop` brings the touch area to 44; the look is unchanged |
| major | Stepper −/+ (AutoClip clip count, Brand Kit font size) were 36 wide | `hitSlop` to 44. The stepper itself stays one TalkBack control with increment and decrement actions |
| major | Assets and Audio sort chips (32 high), editor panels' Export (40), Competitors "Stop tracking" (36 wide) | `hitSlop` to 44 |
| — | The OTP box's tap-catcher and the stepper buttons were flagged as unnamed | Not a problem: they're deliberately hidden from TalkBack, and a labelled control speaks for them. The audit now skips such elements |

## 2. States

| Check | How | Result |
|---|---|---|
| Offline | `src/test/__tests__/states.audit.test.tsx`: every signed-in screen with every request failing to connect, retries run out | Every screen that loads data says so with a way to try again. The screens that load nothing as opened (Help, Legal, the Create hub, editor panels with no project) are listed and explained in the test |
| Empty account | Same test, every mock data area empty | No screen crashes or renders blank |
| Slow network | The retry policy below; loading skeletons on every data screen (checked by the existing screen tests) | OK |
| Expired session | The API client refreshes once on a 401 and signs out if that fails (`packages/shared/src/api/client.test.ts`); the root layout then returns to sign-in with no way back (navigation test) | OK |
| Job failure | AutoClip run failed and refunded (`create/run.test`), tool job failed and refunded (`create.test`), export failed and refunded (`editor.test`), post failed with retry (`social.test`) | OK |

Found and fixed:

| Severity | Finding | Fix |
|---|---|---|
| major | Every failed request was retried 3 times with growing waits, even answers that can't change (not found, paid plans only, validation, the daily limit). Offline, a screen spun for about 7 s before saying anything | `src/lib/queryClient.ts`: no retry for 4xx or unreadable replies; network and server errors retried twice |
| major | Coming back to the app didn't refresh anything: react-query's "refetch on focus" wasn't connected to Android's app state, so balances, post statuses and notifications stayed stale | `focusManager` wired to `AppState` |
| major | Composer offline said "Nothing ready to post yet. Run AutoClip…", misleading the person into thinking they had no clips | Shows "Couldn’t load your clips" with Try again |
| major | Export opened from a notification whose edit failed to load counted as ready, and showed an empty edit to export | "Couldn’t open this edit" with Try again (test in `editor.test`) |
| minor | Export opened with no project at all spun forever | "No edit open", with a way to Drafts |

## 3. Security

| Check | How | Result |
|---|---|---|
| No secrets in the bundle | Searched the exported Android bundle (`expo export`, Hermes bytecode) for key patterns: AWS, Stripe/Razorpay, Google API keys, Resend, ElevenLabs, GitHub, private keys | Clean. The only build-time values are `EXPO_PUBLIC_API_URL` and the public Google web client id. The one "SECRET" hit is React's internal `__SECRET_INTERNALS_…` symbol |
| Tokens only in the secure store | Code search for AsyncStorage / MMKV / token writes | Access and refresh tokens are only in `expo-secure-store` (Android Keystore). No AsyncStorage dependency at all |
| Every endpoint checks auth | `app/api/mobile/v1/auth-coverage.test.ts`: reads every route file (86) and fails if a handler outside the sign-in steps lacks `withMobileAuth` / `withMobileSubscriber` | Passes, and runs in CI |
| Every endpoint checks ownership | Each route's own tests query with the caller's id (projects, clips, assets, jobs, posts, voices, brand kit, billing, assistant tools, social accounts). Spot-checked `jobs/:id` (`readJob` scopes by `userId`) | OK |
| Upgrade wording in server errors | Phase 13.1's `appSafeMessage` strips "Upgrade …" from web errors before the app shows them (Play policy) | OK |

No security fixes were needed in 14.1.

## 4. Performance (from the code; numbers come in 14.2)

- **Long lists** (Projects, Drafts, Clips, Assets, Audio) use FlashList.
- **Images** go through `expo-image`, which caches to disk; thumbnails are the server's own small renders.
- **Bundle:** 5.5 MB Hermes bytecode plus 5.1 MB of assets (fonts and design images).
- **minor:** Notifications, Activity and Scheduled posts render with a plain `ScrollView`. Notifications and Activity load 30 at a time ("Show older"). Scheduled shows one window (30 days back to 90 ahead), which a person with the 10-a-day cap fills with a few hundred rows at most. Fine at today's sizes; move them to FlashList if that changes.
- **Owed on a device:** cold start time, scrolling frame rate on Projects and Assets, memory while previewing a clip.

## 5. Owed in 14.2

- The Maestro flows: sign up → AutoClip → download, and edit → export.
- A TalkBack walkthrough and large-font check on the emulator.
- Startup and scrolling numbers.
- Test coverage report and gaps.
