import { SparklesIcon } from "@clipiro/ui";

export function Default() {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <SparklesIcon className="h-5 w-5 text-accent" />
      <SparklesIcon className="h-8 w-8 text-primary" />
    </div>
  );
}
