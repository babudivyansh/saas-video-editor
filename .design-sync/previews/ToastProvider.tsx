import { useEffect } from "react";
import { Button, ToastProvider, useToast, __dsSettleMotion } from "@clipiro/ui";

// Render the settled state — see .design-sync/preview-support.ts.
__dsSettleMotion();

// Mount ToastProvider once near the app root; anything below it calls
// useToast().showToast(message, "success" | "error" | "info"). Toasts stack
// bottom-centre and auto-dismiss (errors stay 5s, others 3.2s).
function Demo() {
  const { showToast } = useToast();
  const fire = () => {
    showToast("6 clips published to YouTube");
    showToast("Couldn't reach the render server. Your credits were refunded.", "error");
  };
  useEffect(fire, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Button type="button" size="sm" variant="secondary" onClick={fire}>
      Show toasts again
    </Button>
  );
}

// The toast stack is `position: fixed`, which resolves against the nearest
// transformed ancestor — inside a preview card that's the card's own cell, not
// the window. min-h makes that cell fill the card so `bottom-6` lands at the
// bottom as it does in the app. (Not needed in a real layout.) Inline style,
// not `min-h-[272px]`: the shipped CSS holds only classes the app itself uses,
// and no app file uses that arbitrary value, so the class would not exist.
export const SuccessAndError = () => (
  <div style={{ minHeight: 272 }}>
    <ToastProvider>
      <Demo />
    </ToastProvider>
  </div>
);
