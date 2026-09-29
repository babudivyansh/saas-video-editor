// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Input } from "./Field";
import { PasswordInput } from "./PasswordInput";
import { Button } from "./Button";

describe("Input error/hint wiring", () => {
  it("marks the field invalid and points it at the error message", () => {
    render(<Input id="email" aria-label="Email" error="Enter a valid email" />);
    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    const msg = screen.getByRole("alert");
    expect(msg).toHaveTextContent("Enter a valid email");
    expect(input.getAttribute("aria-describedby")).toContain(msg.id);
  });

  it("describes the field with a hint when there is no error", () => {
    render(<Input aria-label="Name" hint="Shown on your profile" />);
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.getByText("Shown on your profile").id).toBe(input.getAttribute("aria-describedby"));
  });

  it("renders no message element when there is nothing to say", () => {
    const { container } = render(<Input aria-label="Plain" />);
    expect(container.querySelector("p")).toBeNull();
  });
});

describe("PasswordInput", () => {
  it("toggles visibility with a labelled button and keeps autocomplete", () => {
    render(<PasswordInput aria-label="Password" autoComplete="current-password" />);
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input).toHaveAttribute("autocomplete", "current-password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Button loading", () => {
  it("is busy and unclickable while loading", () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});
