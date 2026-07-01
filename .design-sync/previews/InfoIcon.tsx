import { InfoIcon } from "@clipiro/ui";

export function Default() {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <InfoIcon className="h-5 w-5 text-blue-700" />
      <InfoIcon className="h-8 w-8 text-blue-700" />
    </div>
  );
}
