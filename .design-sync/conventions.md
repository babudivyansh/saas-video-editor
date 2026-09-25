# Clipiro UI — how to build with it

Dark-first, emerald/lime design system. There is **no light mode**.

## Setup

**No provider or wrapper is needed.** The theme is applied at `:root` by
`styles.css`: near-black canvas, light text, Geist font. Render components
straight onto the page.

One exception: to show toasts, mount `<ToastProvider>` once near the root, then
call `useToast().showToast(message, "success" | "error" | "info")` from anything
below it. `useToast` throws outside the provider.

```jsx
const { Button, Card, ToastProvider, useToast } = window.ClipiroUI;
```

StatTile `accent` still lists legacy `blue` / `violet` / `fuchsia` names. Use
`emerald` or omit it.

## Styling: Tailwind classes — but only ones that already exist

Style your own layout glue with Tailwind utility classes. **The shipped CSS is a
compiled build, not a Tailwind runtime.** A class only works if the Clipiro app
itself already uses it. Arbitrary values like `min-h-[272px]` or `w-[37%]`, and
uncommon steps, silently do nothing. For any one-off size or position, use an
inline `style={{ ... }}` instead. Every class below is verified to exist:

| Purpose | Classes |
|---|---|
| Surfaces | `bg-canvas` (page), `bg-panel` (cards), `bg-surface-1` / `-2` / `-3`, `bg-panel-raised` |
| Text | `text-fg` (primary), `text-fg-muted` (body), `text-fg-subtle` (captions) |
| Lines | `border border-line`, `border-line-strong`, `divide-line` |
| Brand | `grad-brand` (emerald→lime fill), `grad-text` (gradient text), `text-emerald-bright`, `bg-tint-emerald border-tint-emerald-border` |
| Status | `text-success` / `text-warning` / `text-error` / `text-info`, `bg-error/10`, `bg-success/10`, `bg-warning/10`, `bg-tint-amber`, `bg-tint-rose` |
| Depth | `shadow-card`, `shadow-card-hover`, `shadow-glow` |
| Shape | `rounded-[var(--radius-card)]` (24px, cards), `rounded-full` (pills, buttons), `rounded-xl` |
| Layout | `flex`, `grid grid-cols-2`/`3`/`4`, `gap-2`/`3`/`4`/`6`, `space-y-2`/`4`, `p-4`/`5`/`6`, `max-w-md`/`xl`/`2xl` |
| Type | `text-xs`…`text-2xl`, `font-semibold`/`bold`/`extrabold`, `uppercase tracking-wider` |

## Rules that keep a design on-brand

- **Lime is for the one primary action per screen**, via `<Button>` (default
  `variant="primary"`). Never use lime for status, decoration, links or active
  states, and never put white text on lime. Don't reach for `text-brand` or
  `bg-brand` — they resolve to lime.
- Never use `bg-white` or light surfaces. Put content on `bg-panel` cards over
  the canvas.
- Destructive actions: `<Button variant="danger">`, or `danger` on
  `ConfirmDialog` / `DropdownItem`.
- Button `ghost` is only for gradient surfaces (`grad-brand`). On a panel it's
  invisible.
- Use the components before hand-rolling: `Card` for panels, `Modal` /
  `ConfirmDialog` for dialogs, `Dropdown` / `ContextMenu` for menus,
  `EmptyState` for empty lists, `Skeleton*` while loading.

## Where the truth lives

- Each component's `components/<group>/<Name>/<Name>.prompt.md` (props and real
  examples) and `<Name>.d.ts` (the exact props contract).
- `_ds_bundle.css` is the complete compiled stylesheet. If a class isn't in
  it, it doesn't exist.

## Example

```jsx
const { Card, Button, StatTile } = window.ClipiroUI;

<div className="max-w-2xl space-y-4 p-6">
  <div className="grid grid-cols-3 gap-3">
    <StatTile label="Clips made" value={248} accent="emerald" />
    <StatTile label="Credits left" value="1,320" />
    <StatTile label="Published" value={96} />
  </div>
  <Card padding="lg" shadow>
    <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">AutoClip</p>
    <h3 className="mt-2 text-lg font-semibold text-fg">Podcast episode 42</h3>
    <p className="mt-2 text-sm text-fg-muted leading-relaxed">12 clips found, captioned and reframed to 9:16.</p>
    <div className="mt-5 flex gap-2">
      <Button type="button" size="sm">Review clips</Button>
      <Button type="button" size="sm" variant="secondary">Download all</Button>
    </div>
  </Card>
</div>
```
