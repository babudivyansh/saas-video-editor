import { CreditsPill } from "@clipiro/ui";

// The credit balance chip from the dashboard header. Clicking opens the billing
// overlay by default; pass href or onClick to send it elsewhere. Hover/focus
// shows an explanatory tooltip.
export const InHeader = () => (
  <div className="flex items-center justify-between max-w-md rounded-[var(--radius-card)] border border-line bg-panel px-4 py-3">
    <span className="text-sm font-semibold text-fg">Dashboard</span>
    <CreditsPill credits={1320} />
  </div>
);

export const Low = () => <CreditsPill credits={8} href="#" />;
