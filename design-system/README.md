# @clipiro/ui

Clipiro's design system — real, on-brand React components extracted from the live app, not a generic component kit. Every color, radius, shadow, and pattern here mirrors what's actually shipping in the Clipiro product.

## Setup

```tsx
import "@clipiro/ui/dist/styles.css";
```

Import the stylesheet once, near the root of your app. Components are plain React + Tailwind-generated classes — no provider or context is required for light-mode usage.

**Dark mode**: Clipiro's authenticated dashboard runs dark (`zinc-950`/`zinc-100`) while marketing/pricing/auth pages run light. Wrap any subtree that should render in dark mode with a `.dark` class:

```tsx
<div className="dark">
  <Card>…</Card>
</div>
```

`Card`, `Modal`, `Button`, `Input`, `Textarea`, `Select`, `NavBar`, and `Footer` carry `dark:` variants; everything else defaults to light styling, matching real usage.

## Design tokens

Defined in `src/styles.css` via Tailwind v4's `@theme` block, generating real utilities:

| Token | Value | Utilities generated |
|---|---|---|
| `--color-primary` | `#335CFF` | `bg-primary`, `text-primary`, `border-primary` |
| `--color-primary-hover` | `#2348d8` | `bg-primary-hover`, `text-primary-hover` |
| `--color-accent` | `#9333ea` (Veo3-only) | `bg-accent`, `text-accent` |
| `--color-success` | `#22c55e` | `bg-success`, `text-success` |
| `--color-warning` | `#f59e0b` | `bg-warning`, `text-warning` |
| `--color-danger` | `#dc2626` | `bg-danger`, `text-danger` |

## Components

### Foundation
- **Button** — `variant`: primary / secondary / ghost · `size`: sm / md / lg · `loading`
- **Input**, **Textarea** — `label`, `error`
- **Select** — `options`, `label`, `error`
- **Checkbox** — `tone`: primary / accent (accent = Veo3-only contexts)
- **Switch** — `checked`, `onChange`
- **Badge** — `tone`: neutral / primary / success / warning / danger / accent
- **Card** — `highlighted` (filled primary + scaled treatment, matches "most popular" cards)
- **Modal** — `open`, `onClose`, `title`
- **Tabs** — segmented control (matches the pricing page's Monthly/Yearly toggle)
- **Tooltip**
- **Avatar** — `src`, `name`, `size`
- **Alert** — `tone`: success / warning / danger / info
- **Spinner** — `tone`: light / dark
- **ProgressBar** — `value` (0–100)

### Clipiro composites
- **PricingCard** — `name`, `price`, `period`, `subtitle`, `features`, `highlighted`, `badgeLabel`, `ctaLabel`
- **ToolCard** — AI-tool row card with a `CreditBadge` (`name`, `engine`, `cost`, `veo3`)
- **CreditBadge** — color-coded "N credits" pill (`cost`: number | "free", `veo3`)
- **FAQAccordionItem** — grid-rows collapse animation (`question`, `answer`, `open`, `onToggle`)

### Page shells
- **NavBar** — `logo`, `links`, `cta` (simplified; the app's mega-menu dropdowns are not reproduced)
- **Footer** — `logo`, `tagline`, `columns`, `socials`, `copyright`, `bottomLinks`

### Icons
Hand-written inline SVGs (no icon library), matching the app's convention: `CheckIcon`, `XIcon`, `ChevronDownIcon`, `ZapIcon`, `SparklesIcon`, `ArrowRightIcon`, `PlayIcon`, `StarIcon`, `AlertTriangleIcon`, `InfoIcon`.

## Usage

```tsx
import { Button, PricingCard, CreditBadge } from "@clipiro/ui";
import "@clipiro/ui/dist/styles.css";

function Example() {
  return (
    <>
      <Button variant="primary" size="lg">Start Free</Button>

      <PricingCard
        name="Pro"
        price="₹1,799"
        subtitle="140 credits / month"
        features={["140 credits / month", "All AI tools", "Priority rendering"]}
        highlighted
        badgeLabel="Most Popular"
        ctaLabel="Get Pro"
      />

      <CreditBadge cost={35} veo3 />
    </>
  );
}
```
