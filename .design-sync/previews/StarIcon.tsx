import { StarIcon } from "@clipiro/ui";

export function Default() {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <StarIcon className="h-5 w-5 text-warning" />
      <StarIcon className="h-5 w-5 text-warning" />
      <StarIcon className="h-5 w-5 text-warning" />
      <StarIcon className="h-5 w-5 text-warning" />
      <StarIcon className="h-5 w-5 text-gray-200" />
    </div>
  );
}
