import { useState } from "react";
import { Switch } from "@clipiro/ui";

function OnDemo() {
  const [checked, setChecked] = useState(true);
  return <Switch checked={checked} onChange={setChecked} label="Auto-publish to TikTok" />;
}

function OffDemo() {
  const [checked, setChecked] = useState(false);
  return <Switch checked={checked} onChange={setChecked} label="Auto-publish to TikTok" />;
}

function DisabledDemo() {
  const [checked] = useState(false);
  return <Switch checked={checked} onChange={() => {}} label="Auto-publish to TikTok" disabled />;
}

export function States() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <OnDemo />
      <OffDemo />
      <DisabledDemo />
    </div>
  );
}
