import { Checkbox } from "@clipiro/ui";

export function Tones() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Checkbox label="Email me about new features" defaultChecked />
      <Checkbox label="Enable Veo3 AI video generation" tone="accent" defaultChecked />
    </div>
  );
}

export function States() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Checkbox label="Unchecked" />
      <Checkbox label="Checked" defaultChecked />
      <Checkbox label="Disabled" disabled />
    </div>
  );
}
