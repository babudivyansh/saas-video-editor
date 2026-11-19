// @vitest-environment jsdom
//
// The clip panel's accordion (design B): one section open at a time, closed
// sections still show their value, and header controls don't toggle it.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PanelSection, Segmented, useAccordion } from "./PanelSection";

function Tab() {
  const section = useAccordion("trim");
  return (
    <>
      <PanelSection title="Trim" summary="Whole clip" {...section("trim")}><p>trim body</p></PanelSection>
      <PanelSection title="Speed" summary="1.25×" {...section("speed")}><p>speed body</p></PanelSection>
      <PanelSection title="Burn in" summary="On" trailing={<button type="button">toggle</button>} />
    </>
  );
}

describe("PanelSection + useAccordion", () => {
  it("opens the default section and shows every summary", () => {
    render(<Tab />);
    expect(screen.getByText("trim body")).toBeInTheDocument();
    expect(screen.queryByText("speed body")).not.toBeInTheDocument();
    expect(screen.getByText("Whole clip")).toBeInTheDocument();
    expect(screen.getByText("1.25×")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Trim/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps one section open at a time, and closes on a second click", async () => {
    render(<Tab />);
    await userEvent.click(screen.getByRole("button", { name: /Speed/ }));
    expect(screen.getByText("speed body")).toBeInTheDocument();
    expect(screen.queryByText("trim body")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Speed/ }));
    expect(screen.queryByText("speed body")).not.toBeInTheDocument();
  });

  it("renders a row with a trailing control as a plain row, not a toggle", () => {
    render(<Tab />);
    expect(screen.queryByRole("button", { name: /Burn in/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "toggle" })).toBeInTheDocument();
  });
});

describe("Segmented", () => {
  it("marks the current option and reports only a change", async () => {
    const onChange = vi.fn();
    render(<Segmented label="Speed" options={[{ value: 1, label: "1×" }, { value: 2, label: "2×" }]} value={1} onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "1×" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "1×" }));
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("radio", { name: "2×" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });
});
