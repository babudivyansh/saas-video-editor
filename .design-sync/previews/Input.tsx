import { FieldLabel, Input } from "@clipiro/ui";

// Pair every Input with a FieldLabel via htmlFor/id. Input is a thin styled
// <input>: every native attribute (type, placeholder, disabled…) passes through.
export const WithLabel = () => (
  <div className="max-w-sm">
    <FieldLabel htmlFor="workspace">Workspace name</FieldLabel>
    <Input id="workspace" defaultValue="Clipiro Studio" />
  </div>
);

export const Placeholder = () => (
  <div className="max-w-sm">
    <FieldLabel htmlFor="url">Video URL</FieldLabel>
    <Input id="url" type="url" placeholder="https://youtube.com/watch?v=…" />
  </div>
);

export const Disabled = () => (
  <div className="max-w-sm">
    <FieldLabel htmlFor="email">Account email</FieldLabel>
    <Input id="email" type="email" defaultValue="you@clipiro.com" disabled />
  </div>
);
