import { FieldLabel, Textarea } from "@clipiro/ui";

// A styled <textarea>; resizes vertically. All native attributes pass through.
export const WithLabel = () => (
  <div className="max-w-md">
    <FieldLabel htmlFor="script">Video script</FieldLabel>
    <Textarea
      id="script"
      rows={4}
      defaultValue="Most creators post one long video a week. Here's how to turn it into seven Shorts without editing a single frame."
    />
  </div>
);

export const Placeholder = () => (
  <div className="max-w-md">
    <FieldLabel htmlFor="feedback">What could be better?</FieldLabel>
    <Textarea id="feedback" rows={3} placeholder="Tell us what you were trying to do…" />
  </div>
);
