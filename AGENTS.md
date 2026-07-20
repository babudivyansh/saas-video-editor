<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Design system

Clipiro's actual, shipped UI is the **vibrant-gradient dashboard system** (blue `#335CFF` → violet `#7C3AED` → fuchsia `#D946EF`, Plus Jakarta Sans, pill buttons, soft pastel tints) — tokens live in `app/globals.css`, components in `app/components/ui/` (18 primitives: Button, Card, Field, Switch, Checkbox, CreditsPill, CreditRing, Dropdown, Modal, ConfirmDialog, Toast, Skeleton, EmptyState, Tooltip, SectionHeader, ToolCard, StatTile, UsageBarChart).

Full reference, reconciled against the live codebase: **https://claude.ai/code/artifact/41a1933a-0fe0-44b4-9820-f75e3b71e463**

Before proposing colors, fonts, or component patterns, pull actual values from `app/globals.css` / `app/components/ui/` rather than assuming — this codebase has no "Film Editorial" system, no dark mode, and no dedicated success/warning/danger tokens (status is tint + Tailwind color, see the doc above), despite those being plausible-sounding guesses for a video-editing SaaS.
