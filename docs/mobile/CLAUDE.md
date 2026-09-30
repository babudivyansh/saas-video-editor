# Clipiro — Android app (Expo) · rules for Claude Code

## What we're building
The native Android app for clipiro.com (AI short-form video: long video → YouTube Shorts / Instagram Reels / Facebook). No TikTok (not available in India).
The designs are final and live in `design/`:
- `design/SCREENS.md` — all 50 screens, suggested routes, what data each needs. Use it as the checklist.
- `design/screens/*.html` — each screen as HTML at 412px wide. Read exact spacing, sizes and colours from here.
- `design/png/*.png` — renders of each screen, generated from design/screens with Geist. `design/source/` is the original canvas export and is out of date (see SCREENS.md "Revisions").
- `design/images/` — sample photos used in the designs (placeholders for real user content).

## Stack
- Monorepo (pnpm workspaces): `apps/web` (existing Next.js site + backend), `apps/mobile` (Expo), `packages/shared`.
- Mobile: Expo + Expo Router, TypeScript strict, TanStack Query (server data), Zustand (editor state),
  react-native-svg, expo-image, expo-video, expo-secure-store, expo-notifications.
- Shared: zod schemas, typed API client, `packages/shared/tokens.ts`.
- Backend: reuse apps/web. Mobile endpoints under `/api/mobile/v1`, Bearer-token auth.
  Heavy work (AutoClip, renders, AI generation) runs server-side as jobs: return `jobId`, poll `/jobs/:id`, push on completion.

## Design rules (non-negotiable)
- Dark only. Background #050908, panels #0b1210 / #101815. Never light surfaces.
- Lime #c8ff55 (text #071006) is ONLY for the single primary action on a screen. Never for status, links or selection.
- Emerald #20d68a for accents, selection, links, progress. Status colours: warning #f5b544, error #ff6b6b, info #4ea8ff.
- Font Geist (Geist Mono for timecodes). Radii: fields 12, tiles 16, cards 24, buttons/pills fully round.
- Always use tokens from `packages/shared/tokens.ts`; no hard-coded colours or sizes in screens.
- Floating pill tab bar: Home · Projects · Create (centre, emerald) · Social · You.

## Accessibility & quality (non-negotiable)
- Touch targets ≥ 44×44 (use hitSlop when the visual is smaller). Text ≥ 11px, body 15px.
- Every tappable element has accessibilityRole + accessibilityLabel; icon-only buttons always labelled.
- Support system font scaling; no text clipped at 1.3× font size.
- Every data screen has loading (skeleton), empty and error-with-retry states.
- Lists use FlashList. Images via expo-image with caching.

## Working rules
- Plan first; wait for approval before writing code.
- One section per task. Build from shared components in `apps/mobile/components` — don't restyle per screen.
- Never put API keys or AI provider calls in the mobile app. All AI goes through our backend.
- Don't modify apps/web unless the task says so.
- When a screen is done, list anything in the design you could not match.
