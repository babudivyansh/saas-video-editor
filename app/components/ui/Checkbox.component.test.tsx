// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "./Checkbox";

describe("Checkbox labelling", () => {
  // Regression: the Social Tracker's report builder rendered two rows of bare
  // boxes. The names were passed correctly but only ever became aria-labels, so
  // the accounts and sections were selectable and unreadable at the same time.
  it("renders the label as visible text with showLabel", () => {
    render(<Checkbox checked={false} onChange={() => {}} label="Top posts" showLabel />);
    expect(screen.getByText("Top posts")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Top posts" })).toBeInTheDocument();
  });

  // The other three call sites supply their own adjacent text. Showing the label
  // by default would print every one of them twice.
  it("keeps the label invisible by default, as an accessible name only", () => {
    render(<Checkbox checked={false} onChange={() => {}} label="Select clip.mp4" />);
    expect(screen.queryByText("Select clip.mp4")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select clip.mp4" })).toBeInTheDocument();
  });

  it("toggles when the visible text itself is clicked", async () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} label="Trends" showLabel />);
    await userEvent.click(screen.getByText("Trends"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reports checked state to assistive tech in both variants", () => {
    const { rerender } = render(<Checkbox checked onChange={() => {}} label="A" showLabel />);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
    rerender(<Checkbox checked onChange={() => {}} label="A" />);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  });
});
