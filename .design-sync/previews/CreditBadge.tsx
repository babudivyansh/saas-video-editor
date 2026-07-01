import { CreditBadge } from "@clipiro/ui";

export function CostSweep() {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <CreditBadge cost="free" />
      <CreditBadge cost={1} />
      <CreditBadge cost={2} />
      <CreditBadge cost={35} veo3 />
    </div>
  );
}
