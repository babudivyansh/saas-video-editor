import { Spinner } from "@clipiro/ui";

export function OnPrimaryBackground() {
  return (
    <div style={{ background: "#335CFF", padding: 12, borderRadius: 8, display: "inline-flex", gap: 12, alignItems: "center" }}>
      <Spinner tone="light" size="sm" />
      <Spinner tone="light" size="md" />
    </div>
  );
}

export function OnLightBackground() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Spinner tone="dark" size="sm" />
      <Spinner tone="dark" size="md" />
    </div>
  );
}
