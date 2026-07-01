import { Textarea } from "@clipiro/ui";

export function Default() {
  return (
    <div style={{ maxWidth: 360 }}>
      <Textarea
        label="What should we improve?"
        placeholder="Tell us what's missing or confusing…"
        defaultValue="Would love a way to reorder clips before exporting."
      />
    </div>
  );
}
