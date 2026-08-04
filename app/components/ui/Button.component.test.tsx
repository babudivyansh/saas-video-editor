// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./Button";

describe("Button variants", () => {
  it("renders a danger action in red, not in white", () => {
    // The regression guard for the invisible Disconnect button: it shipped as
    // variant="ghost", which is bg-white/15 + text-white, on a white card. The
    // button was in the accessibility tree and completely unreadable on screen.
    render(<Button variant="danger">Disconnect</Button>);
    const btn = screen.getByRole("button", { name: "Disconnect" });
    expect(btn).toHaveClass("text-red-600");
    expect(btn).not.toHaveClass("text-white");
    expect(btn.className).not.toMatch(/bg-white\/\d/);
  });

  it("keeps ghost white, since it is for gradient surfaces", () => {
    // Not a bug — ghost is correct on a hero/gradient background. Pinned so the
    // fix above is understood as "wrong variant", not "ghost is broken".
    render(<Button variant="ghost">On a hero</Button>);
    expect(screen.getByRole("button", { name: "On a hero" })).toHaveClass("text-white");
  });

  it("renders a link when given href, and still carries the variant", () => {
    render(
      <Button variant="danger" href="/x">
        Remove
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Remove" });
    expect(link).toHaveAttribute("href", "/x");
    expect(link).toHaveClass("text-red-600");
  });

  it("blocks interaction when disabled rather than only dimming it", () => {
    render(<Button disabled>Nope</Button>);
    const btn = screen.getByRole("button", { name: "Nope" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveClass("pointer-events-none");
  });
});
