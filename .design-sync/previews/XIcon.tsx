import { XIcon } from "@clipiro/ui";

export function Default() {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <XIcon className="h-5 w-5 text-gray-500" />
      <XIcon className="h-8 w-8 text-danger" />
    </div>
  );
}
