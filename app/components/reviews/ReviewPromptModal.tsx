"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/app/components/ui/Modal";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { StarRating } from "@/app/components/reviews/StarRating";
import { AttachmentUploader, type UploadedAttachment } from "@/app/components/reviews/AttachmentUploader";
import { FieldLabel, Textarea, Input } from "@/app/components/ui/Field";
import { Checkbox } from "@/app/components/ui/Checkbox";
import { Button } from "@/app/components/ui/Button";
import { useAuth } from "@/app/components/AuthContext";
import { FEATURE_USED_OPTIONS, REVIEW_BODY_MAX, REVIEW_BODY_MIN, REVIEW_TITLE_MAX } from "@/lib/reviews/constants";
import type { PromptTrigger } from "@/lib/reviews/prompt-triggers";

interface ReviewPromptModalProps {
  trigger: PromptTrigger;
  // Non-authoritative — pre-fills, never hides, the featureUsed select
  // (most tool completions share the same coarse "ai_tools" bucket, so
  // guessing wrong should always be correctable by the user).
  featureHint?: string;
  /**
   * "auto" resolves to new-or-edit from the caller's actual review. Used by
   * the ?prompt=1 deep link (the "Write a review" CTA on /reviews), which is
   * open to everyone — including users who already reviewed, who would
   * otherwise fill in the whole form only to be 403'd at submit.
   */
  mode?: "new" | "edit" | "auto";
  onClose: () => void;
}

type Step = "rate" | "details" | "attachments" | "thanks";

interface FormState {
  rating: number;
  title: string;
  body: string;
  featureUsed: string;
  wouldRecommend: boolean | null;
  publicDisplayConsent: boolean;
  company: string;
  country: string;
  hp: string; // honeypot — real users never see or fill this
}

function initialForm(featureHint?: string): FormState {
  return {
    rating: 0,
    title: "",
    body: "",
    featureUsed: featureHint ?? FEATURE_USED_OPTIONS[0].value,
    wouldRecommend: null,
    publicDisplayConsent: true,
    company: "",
    country: "",
    hp: "",
  };
}

export function ReviewPromptModal({ featureHint, mode = "new", onClose }: ReviewPromptModalProps) {
  const { token } = useAuth();
  // The user asked for this form rather than being prompted into it.
  const selfInitiated = mode === "auto";
  // null while an "auto"/"edit" open is still fetching the caller's review.
  const [resolvedMode, setResolvedMode] = useState<"new" | "edit" | null>(mode === "new" ? "new" : null);
  const [step, setStep] = useState<Step>(mode === "edit" ? "details" : "rate");
  const [form, setForm] = useState<FormState>(initialForm(featureHint));
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [busy, setBusy] = useState(mode !== "new"); // starts by loading the existing review
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Loads the caller's existing review, when there is one, and prefills the
  // form from it. Shared by "edit" and "auto" — the only difference is that
  // "auto" falls back to a blank new-review form when there's nothing to
  // load, whereas "edit" arrived here believing a review exists (a rejection
  // deep link) and lands on the same fallback if it has since been deleted.
  const loadExisting = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/reviews/me", { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => null);
    if (data?.review) {
      setReviewId(data.review.id);
      setForm((f) => ({
        ...f,
        rating: data.review.rating,
        title: data.review.title ?? "",
        body: data.review.body,
        featureUsed: data.review.featureUsed,
        wouldRecommend: data.review.wouldRecommend ?? null,
        publicDisplayConsent: data.review.publicDisplayConsent ?? true,
        company: data.review.company ?? "",
        country: data.review.country ?? "",
      }));
      setAttachments(data.review.attachments ?? []);
      setResolvedMode("edit");
      setStep("details");
    } else {
      setResolvedMode("new");
      setStep("rate");
    }
    setBusy(false);
  }, [token]);

  useEffect(() => {
    if (mode === "new" || !token) return;
    void loadExisting();
  }, [mode, token, loadExisting]);

  async function dismiss(permanent: boolean) {
    setBusy(true);
    try {
      if (token) {
        await fetch("/api/reviews/prompt-dismiss", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ permanent }),
        });
      }
    } finally {
      setBusy(false);
      onClose();
    }
  }

  // DELETE /api/reviews/me is a real delete — there's no soft-delete column on
  // Review, and the route also drops the attachments' S3 objects, which the
  // DB cascade can't. So it's confirmed, and the copy says it's permanent.
  async function handleDelete() {
    if (!token) return;
    setError(null);
    const res = await fetch("/api/reviews/me", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setConfirmingDelete(false);
      setError(data?.error ?? "Couldn't delete your review — please try again.");
      return;
    }
    onClose();
  }

  function pickRating(rating: number) {
    setForm((f) => ({ ...f, rating }));
    setStep("details");
  }

  async function handleDetailsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.rating < 1) return setError("Please choose a star rating.");
    if (form.body.trim().length < REVIEW_BODY_MIN) return setError(`Your review needs at least ${REVIEW_BODY_MIN} characters.`);
    if (!token) return;

    setBusy(true);
    try {
      const isEdit = resolvedMode === "edit";
      const payload = {
        rating: form.rating,
        title: form.title.trim() || undefined,
        body: form.body.trim(),
        featureUsed: form.featureUsed,
        wouldRecommend: form.wouldRecommend ?? undefined,
        publicDisplayConsent: form.publicDisplayConsent,
        company: form.company.trim() || undefined,
        country: form.country.trim() || undefined,
        ...(isEdit ? {} : { hp: form.hp }),
      };
      const res = await fetch(isEdit ? "/api/reviews/me" : "/api/reviews", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // A review already exists (opened as "new" from a stale client, or a
        // second tab submitted first). There's exactly one review per user,
        // so the right destination is the edit form on top of what's already
        // stored — not a dead-end error on a form they just filled in.
        if (!isEdit && (data?.reason === "already_reviewed" || res.status === 409)) {
          await loadExisting();
          setError("You've already reviewed Clipiro — here's your review, edit it and save.");
          return;
        }
        setError(data?.error ?? "Something went wrong — please try again.");
        return;
      }
      if (isEdit) {
        setStep("thanks");
        return;
      }
      setReviewId(data.review.id);
      setStep("attachments");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      // Closing an unanswered new-review prompt is a "remind me later"
      // dismissal. Closing an edit, a still-resolving open, or a
      // self-initiated one is not: "auto" only ever comes from the user
      // clicking "Write a review" themselves, and recording that as a
      // dismissal would both bump dismissCount and mark whatever prompt
      // event is still open as rejected — poisoning the prompt funnel with
      // an event the prompt system never showed.
      onClose={resolvedMode === "new" && !selfInitiated && (step === "rate" || step === "details") ? () => dismiss(false) : onClose}
      title={
        resolvedMode === null
          ? undefined
          : step === "rate"
            ? "How's Clipiro working out for you?"
            : resolvedMode === "edit"
              ? "Edit your review"
              : step === "attachments"
                ? "Add photos or a video (optional)"
                : undefined
      }
      maxWidth={step === "rate" || step === "thanks" ? "max-w-sm" : "max-w-lg"}
    >
      {resolvedMode !== null && step === "rate" && (
        <div className="flex flex-col items-center gap-4 py-2">
          <p className="text-sm text-ink-soft text-center">Your feedback helps other creators decide, and helps us improve.</p>
          <StarRating value={0} onChange={pickRating} size="lg" />
          {/* Only offered when we interrupted them. Someone who navigated
              here on purpose has nothing to opt out of, and "Don't ask
              again" would silently cost them every future prompt. */}
          {!selfInitiated && (
            <div className="flex items-center gap-4 mt-2">
              <button onClick={() => dismiss(false)} disabled={busy} className="text-xs font-semibold text-ink-soft hover:text-ink cursor-pointer">
                Remind me later
              </button>
              <button onClick={() => dismiss(true)} disabled={busy} className="text-xs font-semibold text-ink-soft hover:text-ink cursor-pointer">
                Don&apos;t ask again
              </button>
            </div>
          )}
          {/* "Don't ask again" silences the prompt permanently, so say plainly
              that it isn't the same as giving up the ability to review. */}
          {!selfInitiated && (
            <p className="text-[11px] text-ink-soft/70 text-center">
              You can always leave one later from Settings.
            </p>
          )}
        </div>
      )}

      {resolvedMode === null ? (
        <div className="py-8 text-center text-sm text-ink-soft">Loading your review…</div>
      ) : step === "details" ? (
        <form onSubmit={handleDetailsSubmit} className="space-y-5">
          <div>
            <FieldLabel>Your rating</FieldLabel>
            <StarRating value={form.rating} onChange={(rating) => setForm((f) => ({ ...f, rating }))} size="lg" />
          </div>

          <div>
            <FieldLabel htmlFor="prompt-feature">Feature used</FieldLabel>
            <select
              id="prompt-feature"
              value={form.featureUsed}
              onChange={(e) => setForm((f) => ({ ...f, featureUsed: e.target.value }))}
              className="w-full text-sm bg-panel border border-card-border rounded-xl px-4 py-2.5 text-ink outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/25 transition-all"
            >
              {FEATURE_USED_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <FieldLabel htmlFor="prompt-title">Title (optional)</FieldLabel>
            <Input
              id="prompt-title"
              value={form.title}
              maxLength={REVIEW_TITLE_MAX}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Sum up your experience"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <FieldLabel htmlFor="prompt-body">Your review</FieldLabel>
              <span className={`text-xs ${form.body.trim().length > 0 && form.body.trim().length < REVIEW_BODY_MIN ? "text-error" : "text-ink-soft"}`}>
                {form.body.length}/{REVIEW_BODY_MAX}
              </span>
            </div>
            <Textarea
              id="prompt-body"
              value={form.body}
              maxLength={REVIEW_BODY_MAX}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              rows={5}
              placeholder="What did you use Clipiro for, and how did it go?"
            />
          </div>

          <div>
            <FieldLabel>Would you recommend Clipiro to a friend?</FieldLabel>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, wouldRecommend: true }))}
                className={`flex-1 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors cursor-pointer ${
                  form.wouldRecommend === true ? "border-transparent grad-brand text-on-primary" : "border-card-border text-ink-soft hover:bg-surface"
                }`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, wouldRecommend: false }))}
                className={`flex-1 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors cursor-pointer ${
                  form.wouldRecommend === false ? "border-transparent grad-brand text-on-primary" : "border-card-border text-ink-soft hover:bg-surface"
                }`}
              >
                No
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="prompt-company">Company (optional)</FieldLabel>
              <Input id="prompt-company" value={form.company} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} placeholder="Acme Inc" />
            </div>
            <div>
              <FieldLabel htmlFor="prompt-country">Country (optional)</FieldLabel>
              <Input id="prompt-country" value={form.country} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} placeholder="India" />
            </div>
          </div>

          {resolvedMode === "edit" && (
            <div>
              <FieldLabel>Photos or video (optional)</FieldLabel>
              <AttachmentUploader attachments={attachments} onChange={setAttachments} token={token ?? null} />
            </div>
          )}

          <div
            className="flex items-start gap-2.5 cursor-pointer"
            onClick={() => setForm((f) => ({ ...f, publicDisplayConsent: !f.publicDisplayConsent }))}
          >
            <Checkbox checked={form.publicDisplayConsent} onChange={(checked) => setForm((f) => ({ ...f, publicDisplayConsent: checked }))} label="Allow public display" />
            <span className="text-xs text-ink-soft">I allow Clipiro to display my review publicly on the website.</span>
          </div>

          {/* Honeypot — visually hidden via the classic clip-rect technique
              (not display:none/type=hidden), so a naive auto-filler that
              skips truly hidden inputs still fills it. A 1x1px clipped
              element in normal flow, not absolutely positioned, so it can't
              interact with the modal panel's own transform/overflow. */}
          <input
            aria-hidden="true"
            tabIndex={-1}
            autoComplete="off"
            value={form.hp}
            onChange={(e) => setForm((f) => ({ ...f, hp: e.target.value }))}
            style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}
          />

          {error && <p className="text-sm text-error">{error}</p>}

          <div className="flex items-center justify-between gap-3">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Saving…" : resolvedMode === "edit" ? "Save changes" : "Submit review"}
            </Button>
            {resolvedMode === "edit" && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={busy}
                className="text-xs font-semibold text-error hover:underline cursor-pointer disabled:opacity-50"
              >
                Delete my review
              </button>
            )}
          </div>
        </form>
      ) : null}

      {step === "attachments" && (
        <div className="space-y-5">
          <AttachmentUploader attachments={attachments} onChange={setAttachments} token={token ?? null} />
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => setStep("thanks")}>Skip</Button>
            <Button variant="primary" onClick={() => setStep("thanks")}>Done</Button>
          </div>
        </div>
      )}

      {step === "thanks" && (
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div className="w-12 h-12 rounded-full grad-brand flex items-center justify-center text-on-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="w-6 h-6">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-sm font-bold text-ink">{resolvedMode === "edit" ? "Your review has been updated" : "Thank you for your review!"}</p>
          <p className="text-xs text-ink-soft">{resolvedMode === "edit" ? "Changes to a published review are re-checked before going live again." : "It'll appear on our site once approved."}</p>
          <Button variant="primary" onClick={onClose}>Done</Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete your review?"
        message="This removes your review and any photos or video attached to it, for good. You can write a new one afterwards."
        confirmLabel="Delete review"
        danger
        onConfirm={handleDelete}
        onClose={() => setConfirmingDelete(false)}
      />
    </Modal>
  );
}
