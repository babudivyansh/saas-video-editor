// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StarRating } from "./StarRating";

describe("StarRating", () => {
  it("calls onChange with the clicked star's value", async () => {
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "4 stars" }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("renders read-only without click handlers firing", async () => {
    const onChange = vi.fn();
    render(<StarRating value={3} onChange={onChange} readOnly />);
    const img = screen.getByRole("img", { name: "3 out of 5 stars" });
    expect(img).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("does not call onChange when no handler is provided", async () => {
    render(<StarRating value={2} />);
    // No radios rendered — not interactive without an onChange handler.
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});
