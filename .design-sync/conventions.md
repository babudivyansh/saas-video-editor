## Setup

Import the stylesheet once, near the root of whatever you build:

```tsx
import "@clipiro/ui/dist/styles.css";
```

No provider or context wrapper is required — every component renders standalone in light mode by default.

**Dark mode**: wrap any subtree that should render dark in a `.dark` class — there is no ThemeProvider, it's a plain CSS scope:

```tsx
<div className="dark">
  <Card>…</Card>
</div>
```

17 of 21 components carry real `dark:` variants verified in source — `Badge`, `Button`, `Card`, `Checkbox`, `FAQAccordionItem`, `Footer`, `Input`, `Modal`, `NavBar`, `PricingCard`, `ProgressBar`, `Select`, `Spinner`, `Switch`, `Tabs`, `Textarea`, `ToolCard`. Only `Alert`, `Avatar`, `CreditBadge`, and `Tooltip` are light-only — don't rely on `.dark` to restyle those four.

## Styling idiom: real Tailwind v4 utilities, brand tokens named semantically

This is a compiled Tailwind v4 build, not CSS-in-JS or a prop-based theme system — style by adding classes via each component's `className` prop, using the DS's own semantic color scale (never raw hex, never a generic Tailwind color for brand surfaces):

| Class family | Use for |
|---|---|
| `bg-primary` / `text-primary` / `border-primary`, `bg-primary-hover` / `text-primary-hover` | Default brand blue (`#335CFF`) — primary actions, links, focus accents |
| `bg-accent` / `text-accent` / `accent-accent` | Purple (`#9333ea`) — reserved for **Veo3-only** UI (badges, checkboxes, credit pills). Don't use accent for general emphasis. |
| `bg-success` / `text-success`, `bg-warning` / `text-warning`, `bg-danger` / `text-danger` | Status coloring (confirmations, low-credit warnings, errors) |
| `font-sans` (already the default) | Geist Sans, shipped in `fonts/` — don't override with a different family |

Only 8 semantic color tokens ship in the compiled CSS — `primary`, `primary-hover`, `accent`, `success`, `warning`, `danger`, plus `black`/`white`. (The source theme also declares `accent-hover` and `success-subtle`, but Tailwind v4 tree-shakes unused custom properties at build time — since no shipped component references them, they aren't in the compiled stylesheet at all. Don't reference `bg-accent-hover` or a `--color-accent-hover` variable; they resolve to nothing.) Standard Tailwind gray/zinc/red/green/blue/amber/purple scales are also available (used internally for borders, subtle backgrounds, and dark-mode zinc surfaces) — feel free to use them for non-brand chrome, but keep brand surfaces (primary actions, Veo3 features, status) on the semantic tokens above.

Every component accepts `className` for one-off layout overrides (spacing, width, grid placement) — never fork a component to change its box model.

## Where the truth lives

- `styles.css` (root) — the full token + component stylesheet; read it before inventing a new utility class combination.
- Each component's `<Name>.d.ts` — the authoritative prop contract.
- Each component's `<Name>.prompt.md` — usage guidance and examples for that specific component.

## Example: real composition (ported from a verified preview)

```tsx
import { PricingCard, Button } from "@clipiro/ui";

<div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(200px, 1fr))", gap: 20 }}>
  <PricingCard
    name="Pro"
    price="₹1,799"
    subtitle="140 credits / month"
    features={["140 credits / month", "All AI tools", "Priority rendering"]}
    highlighted
    badgeLabel="Most Popular"
    ctaLabel="Get Pro"
  />
</div>

<Button variant="primary" size="lg">Start Free</Button>
```
