// Design-environment adapter for BillingOverlayContext. The real provider mounts
// the whole billing overlay and calls the billing API — neither exists in a
// Claude Design render — and the real hook throws without it. CreditsPill only
// needs `openBilling` to be callable, so every action here is a no-op.
const noop = () => {};

export function useBillingOverlay() {
  return {
    openBilling: noop,
    closeBilling: noop,
    isBillingOpen: false,
  };
}

export function BillingOverlayProvider({ children }: { children: React.ReactNode }) {
  return children;
}
