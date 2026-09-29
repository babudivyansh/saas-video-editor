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

  it("keeps confirm disabled until the exact phrase is typed, then passes phrase + reason", async () => {
    const onConfirm = vi.fn(async () => {});
    render(
      <ConfirmDialog open title="Delete user" message="Delete?" confirmLabel="Delete" confirmPhrase="a@b.co" requireReason danger onConfirm={onConfirm} onClose={() => {}} />,
    );
    const btn = screen.getByRole("button", { name: "Delete" });
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "spam account" } });
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: "a@b.c" } });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: "a@b.co" } });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ phrase: "a@b.co", reason: "spam account" }));
  });

  it("requires a reason of at least 3 characters when requireReason is set", () => {
    render(<ConfirmDialog open title="Pause" message="Pause?" confirmLabel="Pause" requireReason onConfirm={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "no" } });
    expect(screen.getByRole("button", { name: "Pause" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "noisy" } });
    expect(screen.getByRole("button", { name: "Pause" })).not.toBeDisabled();
  });
});
