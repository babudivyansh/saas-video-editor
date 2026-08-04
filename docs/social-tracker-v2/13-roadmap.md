# 13 — Prioritised implementation roadmap

Every finding from documents 01–12, ordered Critical → Low, mapped to the build
stage that resolves it.

## Critical

| Ref | Item | Stage |
|---|---|---|
| C3 / S6 | **Meta per-post fan-out** — 100 concurrent Graph calls on a backfill trips an app-wide rate limit. `graphBatch` via `POST /?batch=[…]`, 50 per chunk | 3 |
| C1 / S2 | **Tenancy is copy-pasted and untested**, with no RLS. `assertOwnedAccount` + a mandatory cross-tenant 404 test on every social route | 1, 5 |
| C2 / S1 | **Report links cannot be revoked.** `SocialReportLink` + `jti` + Redis denylist + a Revoke UI | 2, 9 |
| C4 | **Cache invalidated after the refresh loop**, and no user-level version — both serve silently stale data | 1 |

These four ship first. The first prevents an outage, the second prevents a breach,
the third prevents a leak, the fourth prevents lying to the user.

## High

| Ref | Item | Stage |
|---|---|---|
| H8 | **Metric coverage is ~15% of what the APIs expose.** `SocialDailyMetric` + expanded YouTube Analytics and Meta Graph requests | 2, 3 |
| — | **No cross-account overview** — the product's central question is unanswerable | 5, 7 |
| H1 / S3 | **No input validation.** zod across all routes via `withSocial` | 1, 5 |
| H2 | **Keyset pagination skips or repeats rows** when the sort field ties | 5 |
| H3 | **Broken ARIA tabs** — `role="tab"` with no panel, no `aria-controls`, no roving tabindex | 6, 7 |
| H4 | **Charts are mouse-only** — unreadable on touch, unreachable by keyboard | 6 |
| H5 | **Contrast failures** — `text-gray-400` at 2.85:1 carrying content; sub-12px type | 7 |
| H6 | **Design system ignored** — 2 of 21 primitives, no tokens | 7 |
| H7 | **Destructive disconnect with no confirmation** | 7 |
| H9 | **Backfill blocks the connect flow** — a long unexplained wait at the top of the funnel | 3 |
| — | **No goals, forecasting, health score or benchmarking** — numbers without judgement | 4, 5, 7 |
| — | **No PDF/Excel reports** — table stakes for agencies, CSV only today | 9 |

## Medium

| Ref | Item | Stage |
|---|---|---|
| M1 | Loading state is the string `Loading…`; the skeleton never renders and doesn't match the page | 7 |
| M2 | A failed account load renders the empty state — users are told to connect an account they already have | 7 |
| M3 | Toast is not announced to assistive tech | 7 |
| M4 | Export failures are silent (`if (!res.ok) return;`) | 7 |
| M5 | Two components named `StatTile` | 6 |
| M6 | Public report page duplicates formatting logic | 9 |
| M7 | Alerts are hardcoded English in a 13-locale product | 1, 7 |
| M8 | Competitors section returns `null` when unconfigured, rather than explaining itself | 7 |
| M9 | Competitor delete has no error handling and no confirmation | 7 |
| M10 / S8 | `availableProviders()` returns providers whose credentials aren't configured | 3 |
| M11 | Idempotency key labels a date as a week | 8 |
| M12 / S5 | Sync failures are logged, never sent to Sentry | 3 |
| M13 | Heatmap is a `div` grid; empty cells have no label | 6 |
| M14 | `<a href="#">` no-op links | 6 |
| S7 | Rate limiting applied to exactly one route | 5 |
| — | Sequential 50-account refresh loop doesn't scale | 3 |
| — | Audience snapshots grow unbounded — no retention | 2 |
| — | `service.ts` 544 lines, `google.ts` 315, `meta.ts` 370, `page.tsx` 474 | 1, 3, 7 |
| — | Purity leaking: `now` defaults to `new Date()` in pure modules | 1 |
| — | Sync status stored (`partial`, `needs_reauth`, `lastSyncError`) and never surfaced | 7 |

## Low

| Ref | Item | Stage |
|---|---|---|
| L1 | `<img>` instead of `next/image` — needs `remotePatterns` + CSP changes | Deferred |
| L2 | Competitor input has no visible label | 7 |
| L3 | `✕` text node instead of an SVG with `aria-hidden` | 7 |
| L4 | `busy` state holds either a provider id or an account id in one slot | 7 |
| L5 | Tab strip neither wraps nor scrolls on small phones | 7 |
| L6 | `weekDelta` assumes snapshot ordering the component doesn't guarantee | 5 |
| L7 | Range changes use `replaceState`, so Back doesn't undo them | 7 |
| S9 | Social data missing from the GDPR account export | Deferred |

## Build stages

Each is an independently green commit on `feat/social-tracker-v2`, behind the
`social_tracker_v2` flag until Stage 10.

| # | Stage | Resolves | Gates |
|---|---|---|---|
| 0 | Audit deliverables + security-doc corrections | S4 | — |
| 1 | Foundations — capability matrix, `metrics/*` split, `withSocial`, schemas, cache | C1(part), C4, H1(part), M7 | `tsc`, `npm test` |
| 2 | Schema + migration | H8(part), C2(part), retention | full CI |
| 3 | Provider probe + sync expansion | **C3**, H8, H9, M10, M12 | `npm test` + a live sync |
| 4 | Derivation engine | Goals, health, forecast, viral score | `npm test` |
| 5 | API surface + zod + route tests | **C1**, H1, H2, S7, L6 | full CI |
| 6 | Chart package | H3(part), H4, M5, M13, M14 | `npm test` + axe |
| 7 | Dashboard redesign | H3, H5, H6, H7, M1–M4, M8, M9, L2–L5, L7 | full CI + Playwright |
| 8 | AI layer | AI generators, M11 | full CI |
| 9 | Reports + export + link revocation | **C2**, M6 | full CI |
| 10 | Cutover + cleanup | Response envelope, dead code removal | full CI + e2e |

Stage 3 is gated on `scripts/social-probe.mjs` running against one real account
per platform. **`CAPABILITIES` is authored from observed responses, not from
documentation** — Meta deprecates insight metrics aggressively, and this is the
largest schedule risk in the project.

## Explicitly deferred

| Item | Why |
|---|---|
| **Postgres RLS** | Structurally the right control, but retrofitting means auditing every query path in the whole product. Its own project, not a feature branch |
| **White-label reports** | The highest-value agency feature we're not building. Cheap once the PDF pipeline exists — a logo, a colour, a cover page. First post-launch addition |
| **New platforms** (X, LinkedIn, TikTok) | Each needs app review, credentials and legal terms. The architecture makes each one a drop-in adapter afterwards |
| **Dark mode** | The app is light-only by design; a tracker-only dark theme would read as broken |
| **Team / agency multi-tenancy** | No team or org concept exists in the schema at all. A product decision, not a task |
| **Social inbox, listening, sentiment** | Requires ingesting comment text, which changes the privacy posture we document |
| **`next/image` for social CDNs** | Needs `remotePatterns` plus a CSP `img-src` change. Worth doing, not on the critical path |
| **Social data in the GDPR export** | Erasure works via cascade; access requests are incomplete. Small, separate |

## Things that must survive the rewrite

The easiest way to make this feature worse is to lose what already works:

- AES-256-GCM token encryption with per-value IVs and a key outside the database
- PKCE, signed single-use OAuth state, and the `provider_mismatch` re-check
- The `sr-only` data table under every chart — the main reason we keep the
  hand-rolled kit rather than adopting recharts
- `DeltaChip` never encoding direction by colour alone
- The deterministic factsheet discipline in the AI layer
- Credit charge → try → mark completed → catch → refund, with idempotency
- `withRetry` with **full** jitter and three-way error classification
- Snapshot de-duplication on a 6h/identical-values check
- `DELETE` staying available to lapsed subscribers so users can always remove
  their own data
