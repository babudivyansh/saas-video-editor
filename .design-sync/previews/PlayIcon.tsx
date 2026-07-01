import { PlayIcon } from "@clipiro/ui";

export function Default() {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 56,
          height: 56,
          borderRadius: 9999,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
        }}
      >
        <PlayIcon className="h-6 w-6 text-white" />
      </span>
      <PlayIcon className="h-8 w-8 text-primary" />
    </div>
  );
}
