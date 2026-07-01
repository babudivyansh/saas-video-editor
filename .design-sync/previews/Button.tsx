import { Button } from "@clipiro/ui";

export function Variants() {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <Button variant="primary">Start Free</Button>
      <Button variant="secondary">View Plans</Button>
      <Button variant="ghost">Learn more</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Button size="sm">Get Pro</Button>
      <Button size="md">Get Pro</Button>
      <Button size="lg">Get Pro</Button>
    </div>
  );
}

export function LoadingAndDisabled() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Button loading>Upgrading…</Button>
      <Button disabled>Sold out</Button>
    </div>
  );
}
