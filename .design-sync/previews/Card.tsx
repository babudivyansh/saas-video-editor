import { Card } from "@clipiro/ui";

export function Default() {
  return (
    <Card style={{ maxWidth: 320 }}>
      <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af" }}>
        Export quality
      </p>
      <p style={{ marginTop: 8, fontSize: 15, color: "#374151", lineHeight: 1.6 }}>
        Choose 1080p for quick social posts or 4K for archival masters. Higher resolutions use more render credits.
      </p>
    </Card>
  );
}

export function Highlighted() {
  return (
    <Card highlighted style={{ maxWidth: 320 }}>
      <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(255,255,255,0.8)" }}>
        Most popular
      </p>
      <p style={{ marginTop: 8, fontSize: 15, lineHeight: 1.6 }}>
        Pro includes priority rendering, so your clips finish first even during peak hours.
      </p>
    </Card>
  );
}
