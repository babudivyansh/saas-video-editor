import { ChevronDownIcon } from "@clipiro/ui";

export function Default() {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <ChevronDownIcon className="h-4 w-4 text-gray-400" />
      <ChevronDownIcon className="h-6 w-6 text-gray-400 rotate-180" />
    </div>
  );
}
