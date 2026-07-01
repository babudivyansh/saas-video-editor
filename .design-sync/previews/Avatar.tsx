import { Avatar } from "@clipiro/ui";

export function Sizes() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Avatar name="Divyansh Verma" size="sm" />
      <Avatar name="Divyansh Verma" size="md" />
      <Avatar name="Divyansh Verma" size="lg" />
    </div>
  );
}

export function Initials() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Avatar name="Aditi Rao" size="md" />
      <Avatar name="Kabir Singh" size="md" />
      <Avatar name="Zara" size="md" />
    </div>
  );
}
