import { ArrowRightIcon } from "@clipiro/ui";

export function Default() {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: "#335CFF",
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        Learn more
        <ArrowRightIcon className="h-4 w-4" />
      </span>
      <ArrowRightIcon className="h-8 w-8 text-primary" />
    </div>
  );
}
