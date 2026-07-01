import { ZapIcon } from "@clipiro/ui";

export function Default() {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "#335CFF",
          color: "white",
          fontWeight: 700,
          fontSize: 14,
          padding: "10px 18px",
          borderRadius: 9999,
        }}
      >
        <ZapIcon className="h-3.5 w-3.5" />
        Start Free
      </span>
      <ZapIcon className="h-8 w-8 text-primary" />
    </div>
  );
}
