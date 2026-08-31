// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

describe("ConfirmDialog", () => {
  it("renders children between the message and the button row", () => {
    render(
      <ConfirmDialog open title="Ban affiliate" message="Ban this affiliate?" onConfirm={() => {}} onClose={() => {}}>
        <input placeholder="Reason (optional)" />
      </ConfirmDialog>,
    );
    expect(screen.getByText("Ban this affiliate?")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Reason (optional)")).toBeInTheDocument();
  });

  it("renders nothing extra when no children are passed", () => {
    render(<ConfirmDialog open title="Delete" message="Delete this?" onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("disables the confirm button when confirmDisabled is true, e.g. a required reason left empty", () => {
    render(
      <ConfirmDialog open title="Refund" message="Refund this?" confirmLabel="Refund" confirmDisabled onConfirm={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Refund" })).toBeDisabled();
  });

  it("enables the confirm button once confirmDisabled clears", () => {
    render(
      <ConfirmDialog open title="Refund" message="Refund this?" confirmLabel="Refund" confirmDisabled={false} onConfirm={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Refund" })).not.toBeDisabled();
  });

  it("calls onConfirm then onClose on a successful confirm", async () => {
    const onConfirm = vi.fn(async () => {});
    const onClose = vi.fn();
    render(<ConfirmDialog open title="Delete" message="Delete this?" onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "confirm" }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
