import { useState } from "react";
import { Switch } from "@clipiro/ui";

// Controlled on/off toggle for settings that take effect immediately.
// `label` is the aria-label — render the visible text yourself beside it.
export const SettingsRows = () => {
  const [email, setEmail] = useState(true);
  const [topup, setTopup] = useState(false);
  return (
    <div className="max-w-md divide-y divide-line rounded-[var(--radius-card)] border border-line bg-panel">
      <div className="flex items-center justify-between gap-4 p-4">
        <div>
          <p className="text-sm font-semibold text-fg">Email me when clips are ready</p>
          <p className="text-xs text-fg-muted">One email per finished AutoClip run.</p>
        </div>
        <Switch checked={email} onChange={setEmail} label="Email me when clips are ready" />
      </div>
      <div className="flex items-center justify-between gap-4 p-4">
        <div>
          <p className="text-sm font-semibold text-fg">Auto top-up</p>
          <p className="text-xs text-fg-muted">Buy 500 credits when your balance drops below 50.</p>
        </div>
        <Switch checked={topup} onChange={setTopup} label="Auto top-up" />
      </div>
    </div>
  );
};

export const States = () => (
  <div className="flex items-center gap-4">
    <Switch checked onChange={() => {}} label="On" />
    <Switch checked={false} onChange={() => {}} label="Off" />
    <Switch checked disabled onChange={() => {}} label="On, disabled" />
  </div>
);
