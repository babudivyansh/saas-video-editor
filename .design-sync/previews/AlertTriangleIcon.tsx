import { AlertTriangleIcon } from "@clipiro/ui";

export function Default() {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <AlertTriangleIcon className="h-5 w-5 text-warning" />
      <AlertTriangleIcon className="h-8 w-8 text-warning" />
    </div>
  );
}
