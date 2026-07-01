import { Badge } from "@clipiro/ui";

export function Tones() {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <Badge tone="neutral">Neutral</Badge>
      <Badge tone="primary">Primary</Badge>
      <Badge tone="success">Success</Badge>
      <Badge tone="warning">Warning</Badge>
      <Badge tone="danger">Danger</Badge>
      <Badge tone="accent">Accent</Badge>
    </div>
  );
}

export function InContext() {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <Badge tone="success">Most Popular</Badge>
      <Badge tone="primary">New</Badge>
      <Badge tone="accent">Veo3 only</Badge>
      <Badge tone="danger">Failed</Badge>
    </div>
  );
}
