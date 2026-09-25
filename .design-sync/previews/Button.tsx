import { Button } from "@clipiro/ui";

const Chevron = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const Primary = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button type="button" icon={Chevron}>Start free trial</Button>
  </div>
);

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button type="button">Generate clips</Button>
    <Button type="button" variant="secondary">Re-sync</Button>
    <Button type="button" variant="inverse">View plans</Button>
    <Button type="button" variant="danger">Disconnect</Button>
    <Button type="button" variant="link" className="text-fg-muted">Suspend</Button>
  </div>
);

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button type="button" size="sm">Top up</Button>
    <Button type="button" size="md">Top up</Button>
    <Button type="button" size="lg">Top up</Button>
  </div>
);

// `ghost` is built for gradient/hero surfaces only — on a plain panel it is
// white-on-white. Shown in its intended context.
export const GhostOnHero = () => (
  <div className="grad-brand rounded-[var(--radius-card)] p-6 flex flex-wrap items-center gap-3">
    <Button type="button" variant="inverse">Upgrade to Pro</Button>
    <Button type="button" variant="ghost">Compare plans</Button>
  </div>
);

export const Disabled = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button type="button" disabled>Rendering…</Button>
    <Button type="button" variant="secondary" disabled>Re-sync</Button>
  </div>
);
