// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "./Card";

describe("Card", () => {
  it("has no shadow by default when not interactive", () => {
    render(<Card>content</Card>);
    expect(screen.getByText("content")).not.toHaveClass("shadow-card");
  });

  it("applies a static shadow-card when shadow is set, independent of interactive", () => {
    render(<Card shadow>content</Card>);
    expect(screen.getByText("content")).toHaveClass("shadow-card");
  });

  it("does not add the hover-lift classes just from shadow alone", () => {
    render(<Card shadow>content</Card>);
    expect(screen.getByText("content")).not.toHaveClass("hover:-translate-y-0.5");
  });

  it("combines shadow with interactive's hover lift", () => {
    render(<Card shadow interactive>content</Card>);
    const el = screen.getByText("content");
    expect(el).toHaveClass("shadow-card");
    expect(el).toHaveClass("hover:-translate-y-0.5");
  });
});
