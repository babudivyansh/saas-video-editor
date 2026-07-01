import { Alert } from "@clipiro/ui";

export function Tones() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Alert tone="success" title="Payment received">Your Pro subscription is now active.</Alert>
      <Alert tone="warning" title="Low on credits">You have 4 credits left this month — they refill on your next billing date.</Alert>
      <Alert tone="danger" title="Render failed">We couldn't process this clip. No credits were charged — please try again.</Alert>
      <Alert tone="info" title="Veo3 credits are separate">Veo3 Video Pack credits can only be used for Veo3 AI video generation, not other tools.</Alert>
    </div>
  );
}
