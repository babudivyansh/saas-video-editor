<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Design system

Clipiro's actual, shipped UI is the **dark emerald system** (near-black surfaces, emerald/lime accent — `--emerald-brand: #00a968`, `--emerald-bright: #20d68a`, dedicated `--success/--warning/--error/--info` tokens) — tokens live in `app/globals.css`, components in `app/components/ui/` (24 primitives: Button, Card, Field, Switch, Checkbox, CreditsPill, CreditRing, Dropdown, Modal, ConfirmDialog, Toast, Skeleton, EmptyState, Tooltip, SectionHeader, ToolCard, StatTile, UsageBarChart, Tabs, Breadcrumbs, ContextMenu, FaqAccordion, and others — check the directory, it grows). **Dark-first; there is no light mode.** A surface opts in via the `theme-emerald` class, applied on `<body>` (not per-shell — modals/popovers portal to `document.body`).

Full reference, in-repo: **[`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md)** (ownership — which system a surface belongs to) and **[`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)** (full token/component reference). Read `DESIGN_SYSTEM.md` first — it lists the deliberate, scoped exceptions that stay light on purpose: email/PDF reports/OG images (render outside the app shell), the editor's own `--editor-*` token namespace, and the WhatsApp/Telegram/iMessage/Reddit mockup regions in `app/dashboard/create/**` whose colors ffmpeg burns into exported video.

The old blue/violet/fuchsia gradient system (`#335CFF` → `#7C3AED` → `#D946EF`) shipped by this file previously — it was **deleted from the repo** in the 2026-09 emerald migration. Before proposing colors, fonts, or component patterns, pull actual values from `app/globals.css` / `app/components/ui/` rather than assuming — this codebase has no "Film Editorial" system and no per-page light/dark toggle, despite those being plausible-sounding guesses for a video-editing SaaS.
