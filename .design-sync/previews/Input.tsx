import { Input } from "@clipiro/ui";

export function Default() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 320 }}>
      <Input label="Email address" placeholder="you@example.com" defaultValue="divyansh@clipiro.com" />
    </div>
  );
}

export function ErrorState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 320 }}>
      <Input label="Coupon code" defaultValue="LAUNCH2025" error="This code has expired" />
    </div>
  );
}
