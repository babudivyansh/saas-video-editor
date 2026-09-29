"use client";

import { useId, useState } from "react";
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
  /**
   * Type-to-confirm: the confirm button stays disabled until the user types
   * exactly this (an email, a job id, "DELETE"). For destructive admin actions
   * — the server must re-check the same phrase, this is not the security gate.
   */
  confirmPhrase?: string;
  /** Adds a required "Reason" field (recorded in the audit log by the caller). */
  requireReason?: boolean;
  /** May be async — the dialog stays open and disabled until it settles.
   * Receives what was typed into the phrase and reason fields. */
  onConfirm: (input: { phrase: string; reason: string }) => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({
  open, title, message, confirmLabel, danger, children, confirmDisabled, confirmPhrase, requireReason, onConfirm, onClose,
}: ConfirmDialogProps) {
  const t = useTranslations("Common");
  const [busy, setBusy] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [reason, setReason] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  const phraseId = useId();
  const reasonId = useId();
  // Fresh fields every time the dialog opens — a phrase typed for one target
  // must never carry over to the next.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPhrase("");
      setReason("");
    }
  }
  const phraseOk = !confirmPhrase || phrase === confirmPhrase;
  const reasonOk = !requireReason || reason.trim().length >= 3;

  // Previously this ran `onConfirm(); onClose();` back to back, so the dialog
  // vanished the instant it was clicked: any pending label the caller passed
  // (e.g. "Cancelling…") was never visible, the action could be double-fired
  // from a second click before the first resolved, and a failure surfaced only
  // as a banner behind where the dialog had been. Now it awaits the work.
  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm({ phrase, reason: reason.trim() });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={title} maxWidth="max-w-sm">
      <p className="text-sm text-ink-soft">{message}</p>
      {children && <div className="mt-3">{children}</div>}
      {requireReason && (
        <div className="mt-3">
          <label htmlFor={reasonId} className="block text-xs font-semibold text-fg-muted mb-1">Reason (saved to the audit log)</label>
          <input
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            className="w-full text-sm bg-surface-2 border border-line rounded-lg px-3 py-2 text-fg"
          />
        </div>
      )}
      {confirmPhrase && (
        <div className="mt-3">
          <label htmlFor={phraseId} className="block text-xs font-semibold text-fg-muted mb-1">
            Type <code className="font-mono text-fg bg-surface-3 rounded px-1">{confirmPhrase}</code> to confirm
          </label>
          <input
            id={phraseId}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="w-full text-sm font-mono bg-surface-2 border border-line rounded-lg px-3 py-2 text-fg"
          />
        </div>
      )}
      <div className="flex items-center justify-end gap-2 mt-5">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>{t("cancel")}</Button>
        <Button
          variant="primary"
          size="sm"
          onClick={confirm}
          disabled={busy || confirmDisabled || !phraseOk || !reasonOk}
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
