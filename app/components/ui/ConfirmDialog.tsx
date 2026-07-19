"use client";

import { useTranslations } from "next-intl";
import { Modal } from "@/app/components/ui/Modal";
import { Button } from "@/app/components/ui/Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, danger, onConfirm, onClose }: ConfirmDialogProps) {
  const t = useTranslations("Common");
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-sm">
      <p className="text-sm text-ink-soft">{message}</p>
      <div className="flex items-center justify-end gap-2 mt-5">
        <Button variant="secondary" size="sm" onClick={onClose}>{t("cancel")}</Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => { onConfirm(); onClose(); }}
          className={danger ? "!bg-none !bg-red-600 !shadow-none hover:!brightness-105" : undefined}
        >
          {confirmLabel ?? t("confirm")}
        </Button>
      </div>
    </Modal>
  );
}
