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
  /** May be async — the dialog stays open and disabled until it settles. */
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, danger, onConfirm, onClose }: ConfirmDialogProps) {
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
      <div className="flex items-center justify-end gap-2 mt-5">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>{t("cancel")}</Button>
        <Button
          variant="primary"
          size="sm"
          onClick={confirm}
          disabled={busy}
          className={danger ? "!bg-none !bg-red-600 !shadow-none hover:!brightness-105" : undefined}
        >
          {confirmLabel ?? t("confirm")}
        </Button>
      </div>
    </Modal>
  );
}
