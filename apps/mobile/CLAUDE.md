@AGENTS.md
@../../docs/mobile/CLAUDE.md

## This app in the repo
- Lives in `apps/mobile` with its OWN `package.json` / `package-lock.json` — it is deliberately not an npm workspace member (the web app at the repo root must not install Expo deps on Hostinger). Run commands from this folder, or `npm run dev:mobile` / `*:mobile` from the root.
- React is pinned to 19.2.4 (same as web) via `overrides`; `expo.install.exclude` keeps `expo install` from moving it back to SDK 57's 19.2.3. React Native's renderer has no exact-version check, so this is safe.
- Design tokens come from `@clipiro/shared` (a `file:` link to `packages/shared`); Metro watches only that folder (see metro.config.js).
- Routes live in `src/app/`; shared components in `src/components/`. Styles use tokens only — no raw colours or sizes in screens.
- Android ignores `fontWeight` for custom fonts: always style text through `src/theme/typography.ts`, which picks the right Geist file per weight.
