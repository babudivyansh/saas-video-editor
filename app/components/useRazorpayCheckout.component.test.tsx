// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRazorpayCheckout } from "./useRazorpayCheckout";

vi.mock("./AuthContext", () => ({
  useAuth: () => ({ user: { email: "test@example.com" }, token: "test-token" }),
}));

vi.mock("@/lib/razorpay", () => ({
  loadRazorpayScript: vi.fn().mockResolvedValue(true),
}));

interface RzpOptions {
  amount: number;
  order_id: string;
  handler: (r: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
}

function Harness({ onError }: { onError?: (msg: string) => void }) {
  const { startCheckout, loading } = useRazorpayCheckout();
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <button onClick={() => void startCheckout({ planId: "test-plan", onError })}>Buy</button>
    </div>
  );
}

describe("useRazorpayCheckout", () => {
  let rzpConstructor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // A regular `function` (not an arrow) so it's usable with `new`, matching
    // how useRazorpayCheckout invokes `new window.Razorpay(options)`.
    rzpConstructor = vi.fn().mockImplementation(function (this: { options: RzpOptions; open: () => void }, options: RzpOptions) {
      this.options = options;
      this.open = vi.fn();
    });
    (window as unknown as { Razorpay: unknown }).Razorpay = rzpConstructor;
  });

  it("fetches an order and opens Razorpay with the amount the API returned", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        orderId: "order_1",
        amount: 10000,
        currency: "INR",
        keyId: "rzp_test_x",
        packName: "Test Pack",
        credits: 50,
      }),
    }) as unknown as typeof fetch;

    render(<Harness />);
    await userEvent.click(screen.getByText("Buy"));

    await waitFor(() => expect(rzpConstructor).toHaveBeenCalled());
    const options = rzpConstructor.mock.calls[0][0] as RzpOptions;
    expect(options.amount).toBe(10000);
    expect(options.order_id).toBe("order_1");
  });

  it("surfaces a checkout error via onError instead of opening Razorpay", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Insufficient credits" }),
    }) as unknown as typeof fetch;
    const onError = vi.fn();

    render(<Harness onError={onError} />);
    await userEvent.click(screen.getByText("Buy"));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("Insufficient credits"));
    expect(rzpConstructor).not.toHaveBeenCalled();
  });
});
