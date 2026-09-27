// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/components/billing/BillingOverlayContext", () => ({ useBillingOverlay: () => ({ openBilling: vi.fn() }) }));
vi.mock("@/app/components/ui/Tooltip", () => ({
  Tooltip: ({ children, content }: { children: React.ReactNode; content: string }) => <div data-tip={content}>{children}</div>,
}));

const { CreditsPill } = await import("./CreditsPill");

describe("CreditsPill", () => {
  it("shows both meters — Clip Minutes first — when given minutes", () => {
    render(<CreditsPill credits={38} minutes={142} />);
    expect(screen.getByLabelText("142 Clip Minutes")).toBeInTheDocument();
    expect(screen.getByLabelText("38 AI credits")).toBeInTheDocument();
    const text = screen.getByRole("button").textContent ?? "";
    expect(text.indexOf("142")).toBeLessThan(text.indexOf("38"));
  });

  it("explains which meter pays for what", () => {
    const { container } = render(<CreditsPill credits={38} minutes={142} />);
    expect(container.querySelector("[data-tip]")?.getAttribute("data-tip")).toMatch(/Clip Minutes pay for Auto Clips/);
  });

  it("flags low Clip Minutes in its accessible name", () => {
    render(<CreditsPill credits={38} minutes={12} minutesLow />);
    expect(screen.getByLabelText("12 Clip Minutes — running low")).toBeInTheDocument();
  });

  it("keeps the single-meter form for callers that pass only credits", () => {
    render(<CreditsPill credits={12} />);
    expect(screen.getByRole("button").textContent).toBe("12credits");
  });
});
