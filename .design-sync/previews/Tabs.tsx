import { Tabs } from "@clipiro/ui";

// Uncontrolled: pass `items` (each with its own `content`) and an accessible
// `label`. Arrow keys / Home / End move between tabs.
export const WithBadges = () => (
  <div className="max-w-xl">
    <Tabs
      label="Clips"
      items={[
        {
          id: "ready",
          label: "Ready",
          badge: 12,
          content: <p className="text-sm text-fg-muted">12 clips rendered and ready to download or publish.</p>,
        },
        {
          id: "rendering",
          label: "Rendering",
          badge: 3,
          content: <p className="text-sm text-fg-muted">3 clips are rendering. This usually takes under two minutes.</p>,
        },
        {
          id: "failed",
          label: "Failed",
          badge: 1,
          content: <p className="text-sm text-fg-muted">1 clip failed to render. Your credits were refunded.</p>,
        },
      ]}
    />
  </div>
);

export const SecondTabActive = () => (
  <div className="max-w-xl">
    <Tabs
      label="Account"
      defaultId="billing"
      items={[
        { id: "profile", label: "Profile", content: <p className="text-sm text-fg-muted">Name, avatar and email.</p> },
        { id: "billing", label: "Billing", content: <p className="text-sm text-fg-muted">Creator Pro · renews 12 Oct · ₹2,499/month</p> },
        { id: "notifications", label: "Notifications", content: <p className="text-sm text-fg-muted">Email and in-app alerts.</p> },
      ]}
    />
  </div>
);
