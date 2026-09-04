"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/app/components/ui/Modal";
import { Button } from "@/app/components/ui/Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  /**
   * Extra content rendered between the message and the button row — for a
   * caller that needs to collect something (e.g. a ban/refund reason) before
   * confirming, instead of building its own inline row-with-input pattern.
   */
  children?: React.ReactNode;
  /** Disables the confirm button without the caller needing its own `busy`
   * state — e.g. a required reason field that isn't filled in yet. */
  confirmDisabled?: boolean;
  /** May be async — the dialog stays open and disabled until it settles. */
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, danger, children, confirmDisabled, onConfirm, onClose }: ConfirmDialogProps) {
  const t = useTranslations("Common");
  const [busy, setBusy] = useState(false);

  // Previously this ran `onConfirm(); onClose();` back to back, so the dialog
  // vanished the instant it was clicked: any pending label the caller passed
  // (e.g. "Cancelling…") was never visible, the action could be double-fired
  // from a second click before the first resolved, and a failure surfaced only
  // as a banner behind where the dialog had been. Now it awaits the work.
  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={title} maxWidth="max-w-sm">
      <p className="text-sm text-ink-soft">{message}</p>
      {children && <div className="mt-3">{children}</div>}
      <div className="flex items-center justify-end gap-2 mt-5">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>{t("cancel")}</Button>
        <Button
          variant="primary"
          size="sm"
          onClick={confirm}
          disabled={busy || confirmDisabled}
          // A filled destructive confirm, unlike Button's outlined `danger`:
          // this is the committing action in a modal the user opened on
          // purpose, so it should carry the weight a row-level "Disconnect"
          // shouldn't. Overrides the primary fill rather than adding a variant,
          // and `text-bg` keeps the label readable on the error fill in both
          // themes (the primary fill's own text token is tuned for lime).
          className={
            danger
              ? "!bg-none !bg-error !text-bg !shadow-none hover:!brightness-110"
              : undefined
          }
        >
          {confirmLabel ?? t("confirm")}
        </Button>
      </div>
    </Modal>
  );
}
