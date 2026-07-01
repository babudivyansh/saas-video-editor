import { Modal, Button } from "@clipiro/ui";

export function UpgradePrompt() {
  return (
    <Modal open title="Upgrade to Pro" onClose={() => {}}>
      <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
        You've used all 50 credits on your Creator plan this month. Upgrade to Pro for 140 credits / month,
        priority rendering, and Veo3 AI video generation.
      </p>
      <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
        <Button variant="primary">Upgrade to Pro — ₹1,799/mo</Button>
        <Button variant="secondary">Maybe later</Button>
      </div>
    </Modal>
  );
}
