import { ProgressBar } from "@clipiro/ui";

export function CreditsUsed() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 260 }}>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
          <span>Monthly credits used</span>
          <span>92 / 140</span>
        </div>
        <ProgressBar value={66} />
      </div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
          <span>Render queue</span>
          <span>90%</span>
        </div>
        <ProgressBar value={90} />
      </div>
    </div>
  );
}

export function Sweep() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 260 }}>
      <ProgressBar value={25} />
      <ProgressBar value={60} />
      <ProgressBar value={100} />
    </div>
  );
}
