import { CheckIcon } from "@clipiro/ui";

export function Default() {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <CheckIcon className="h-5 w-5 text-primary" />
      <CheckIcon className="h-8 w-8 text-success" />
    </div>
  );
}
