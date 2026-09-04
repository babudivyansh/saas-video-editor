"use client";

import { useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import { Modal } from "@/app/components/ui/Modal";
import { Button } from "@/app/components/ui/Button";
import { FieldLabel, Textarea } from "@/app/components/ui/Field";

// Modal.tsx reads useTranslations("Common") for its close-button label. The
// public /reviews page (this modal's caller) sits outside the dashboard's
// NextIntlClientProvider tree (see app/components/AppShellLayout.tsx — only
// mounted under /dashboard), so this locally supplies just that one
// namespace rather than pulling the whole dashboard i18n setup onto a
// public marketing page.
const COMMON_MESSAGES = { Common: { cancel: "Cancel", confirm: "Confirm", close: "Close" } };

const REASONS = [
  { value: "spam", label: "Spam" },
  { value: "offensive", label: "Offensive content" },
  { value: "fake", label: "Fake review" },
  { value: "off_topic", label: "Off-topic" },
  { value: "other", label: "Other" },
];

interface ReportReviewModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string, details: string) => Promise<void>;
}

export function ReportReviewModal({ open, onClose, onSubmit }: ReportReviewModalProps) {
  const [reason, setReason] = useState(REASONS[0].value);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    try {
      await onSubmit(reason, details.trim());
      setDetails("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <NextIntlClientProvider locale="en" messages={COMMON_MESSAGES}>
    <Modal open={open} onClose={onClose} title="Report this review" maxWidth="max-w-sm">
      <div className="space-y-4">
        <div>
          <FieldLabel htmlFor="report-reason">Reason</FieldLabel>
          <select
            id="report-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full text-sm bg-panel border border-card-border rounded-xl px-4 py-2.5 text-ink outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all"
          >
            {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="report-details">Details (optional)</FieldLabel>
          <Textarea id="report-details" value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={500} />
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} disabled={busy}>{busy ? "Submitting…" : "Submit report"}</Button>
        </div>
      </div>
    </Modal>
    </NextIntlClientProvider>
  );
}
