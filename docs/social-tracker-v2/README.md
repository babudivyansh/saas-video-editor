# Social Tracker v2 — audit & redesign

Deliverables from the end-to-end audit of the shipped Social Tracker and the plan
that replaces it. Written against the codebase as of branch
`feat/social-tracker-v2` (base: `main` @ `fa215b2`).

| # | Document | What it answers |
|---|---|---|
| 01 | [Feature audit](01-feature-audit.md) | Every defect found, with impact and priority |
| 02 | [UX audit](02-ux-audit.md) | Interaction, accessibility, responsive, states |
| 03 | [Technical audit](03-technical-audit.md) | Architecture, data flow, caching, sync |
| 04 | [Feature gap analysis](04-gap-analysis.md) | What a modern analytics product has that we don't |
| 05 | [Competitor comparison](05-competitor-comparison.md) | Us vs. eight named platforms |
| 06 | [Dashboard redesign](06-dashboard-redesign.md) | The new IA, layout, and component system |
| 07 | [AI features](07-ai-features.md) | What AI should do here, and what it must not |
| 08 | [Analytics roadmap](08-analytics-roadmap.md) | Metric coverage, sequenced |
| 09 | [Database](09-database.md) | Schema changes and why |
| 10 | [API](10-api.md) | Route surface, validation, contracts |
| 11 | [Performance](11-performance.md) | Where the time goes and how to get it back |
| 12 | [Security review](12-security-review.md) | Findings against the current implementation |
| 13 | [Implementation roadmap](13-roadmap.md) | Critical → Low, mapped to build stages |

**Scope decisions taken before writing these.** All KPIs are shown, with
provider-unsupported ones greyed and explained rather than hidden. Platforms stay
YouTube, Instagram and Facebook. No dark mode — the app is light-only by design.

The single most important theme running through all thirteen documents: the
existing backend is *well built* — encrypted tokens, PKCE, single-use OAuth state,
a pure deterministic analytics engine, credit idempotency with refunds, retry with
full jitter. The gaps are **coverage** (we fetch a fraction of what the APIs
expose), **surface** (no goals, forecasting, benchmarking, reports), and
**polish** (the UI ignores its own design system and has real accessibility
defects). The plan reuses the architecture rather than replacing it.
