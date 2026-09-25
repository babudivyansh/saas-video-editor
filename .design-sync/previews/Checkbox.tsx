import { useState } from "react";
import { Checkbox } from "@clipiro/ui";

// Controlled: pass `checked` and `onChange`. `label` is only an aria-label
// unless `showLabel` is set — use showLabel when there is no surrounding text.
export const WithLabel = () => {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  const [c, setC] = useState(true);
  return (
    <div className="flex flex-col gap-3">
      <Checkbox checked={a} onChange={setA} label="Burn captions into the video" showLabel />
      <Checkbox checked={b} onChange={setB} label="Add background music" showLabel />
      <Checkbox checked={c} onChange={setC} label="Auto-reframe to 9:16" showLabel />
    </div>
  );
};

// Inside the caller's own label/row, omit showLabel so the name isn't printed twice.
export const InlineWithOwnText = () => {
  const [on, setOn] = useState(false);
  return (
    <label className="flex items-start gap-3 max-w-sm text-sm text-fg-muted">
      <Checkbox checked={on} onChange={setOn} label="Allow Clipiro to display my review publicly" />
      <span>Allow Clipiro to display my review publicly on the website.</span>
    </label>
  );
};
