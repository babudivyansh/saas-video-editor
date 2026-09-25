import { Button, Card } from "@clipiro/ui";

export const ContentPanel = () => (
  <Card padding="lg" shadow className="max-w-md">
    <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">AutoClip</p>
    <h3 className="mt-2 text-lg font-semibold text-fg">Podcast episode 42 — The creator economy</h3>
    <p className="mt-2 text-sm text-fg-muted leading-relaxed">
      12 clips found from a 58-minute upload. Each is captioned, reframed to 9:16 and scored for how likely it is to hold attention.
    </p>
    <div className="mt-5 flex gap-2">
      <Button type="button" size="sm">Review clips</Button>
      <Button type="button" size="sm" variant="secondary">Download all</Button>
    </div>
  </Card>
);

export const Tints = () => (
  <div className="grid grid-cols-3 gap-3 max-w-xl">
    {(["none", "emerald", "violet", "amber", "rose", "blue"] as const).map((tint) => (
      <Card key={tint} tint={tint} padding="md">
        <p className="text-sm font-semibold text-fg capitalize">{tint}</p>
        <p className="mt-1 text-xs text-fg-muted">tint="{tint}"</p>
      </Card>
    ))}
  </div>
);

export const Interactive = () => (
  <div className="grid grid-cols-2 gap-3 max-w-lg">
    <Card href="#" padding="md">
      <p className="text-sm font-semibold text-fg">Brand kit</p>
      <p className="mt-1 text-xs text-fg-muted">Logos, colours and fonts applied to every export.</p>
    </Card>
    <Card href="#" padding="md" tint="emerald">
      <p className="text-sm font-semibold text-fg">Asset library</p>
      <p className="mt-1 text-xs text-fg-muted">148 files · 2.4 GB used</p>
    </Card>
  </div>
);
