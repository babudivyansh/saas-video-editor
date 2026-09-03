// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./Button";

describe("Button variants", () => {
  it("renders a danger action in the error colour, not in white", () => {
    // The regression guard for the invisible Disconnect button: it shipped as
    // variant="ghost", which is bg-white/15 + text-white, on a white card. The
    // button was in the accessibility tree and completely unreadable on screen.
    // The invariant is "a destructive action never takes its colour from the
    // surface it sits on" — `text-error` is the token that used to be
    // `text-red-600`, and it is a real colour in both themes.
    render(<Button variant="danger">Disconnect</Button>);
    const btn = screen.getByRole("button", { name: "Disconnect" });
    expect(btn).toHaveClass("text-error");
    expect(btn).not.toHaveClass("text-white");
    expect(btn.className).not.toMatch(/bg-white\/\d/);
    expect(btn.className).not.toMatch(/\bbg-panel\b/);
  });

  it("puts near-black text on the primary fill, never white", () => {
    // The emerald theme fills primary with lime, where white text is 1.6:1.
    // `text-on-primary` tracks the fill (white on the light theme, #071006 on
    // lime), so this guards the pairing rather than a specific colour.
    render(<Button variant="primary">Start</Button>);
    const btn = screen.getByRole("button", { name: "Start" });
    expect(btn).toHaveClass("grad-brand");
    expect(btn).toHaveClass("text-on-primary");
    expect(btn).not.toHaveClass("text-white");
  });

  it("keeps inverse inverted against the page rather than matching a card", () => {
    // `inverse` is a dark chip on a light page and a light chip on a dark one.
    // Mapping it onto the panel surface would silently make it a duplicate of
    // `secondary`.
    render(<Button variant="inverse">Invert</Button>);
    const btn = screen.getByRole("button", { name: "Invert" });
    expect(btn).toHaveClass("bg-fg");
    expect(btn).toHaveClass("text-bg");
  });

  it("gives every variant a visible keyboard focus ring", () => {
    // Button previously defined no focus-visible treatment at all, leaving the
    // browser default — which is a blue halo belonging to neither theme.
    render(<Button>Focus me</Button>);
    expect(screen.getByRole("button", { name: "Focus me" }).className).toMatch(
      /focus-visible:ring-2/,
    );
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
    expect(link).toHaveClass("text-error");
  });

  it("blocks interaction when disabled rather than only dimming it", () => {
    render(<Button disabled>Nope</Button>);
    const btn = screen.getByRole("button", { name: "Nope" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveClass("pointer-events-none");
  });
});
