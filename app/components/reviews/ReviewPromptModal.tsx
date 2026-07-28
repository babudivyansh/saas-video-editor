"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/app/components/ui/Modal";
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
  mode?: "new" | "edit";
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
  const [step, setStep] = useState<Step>(mode === "edit" ? "details" : "rate");
  const [form, setForm] = useState<FormState>(initialForm(featureHint));
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [busy, setBusy] = useState(mode === "edit"); // edit mode starts by loading the existing review
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "edit" || !token) return;
    (async () => {
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
      }
      setBusy(false);
    })();
  }, [mode, token]);

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
      const payload = {
        rating: form.rating,
        title: form.title.trim() || undefined,
        body: form.body.trim(),
        featureUsed: form.featureUsed,
        wouldRecommend: form.wouldRecommend ?? undefined,
        publicDisplayConsent: form.publicDisplayConsent,
        company: form.company.trim() || undefined,
        country: form.country.trim() || undefined,
        ...(mode === "new" ? { hp: form.hp } : {}),
      };
      const res = await fetch(mode === "edit" ? "/api/reviews/me" : "/api/reviews", {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong — please try again.");
        return;
      }
      if (mode === "edit") {
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
      onClose={step === "rate" || step === "details" ? () => (mode === "edit" ? onClose() : dismiss(false)) : onClose}
      title={
        step === "rate"
          ? "How's Clipiro working out for you?"
          : mode === "edit"
            ? "Edit your review"
            : step === "attachments"
              ? "Add photos or a video (optional)"
              : undefined
      }
      maxWidth={step === "rate" || step === "thanks" ? "max-w-sm" : "max-w-lg"}
    >
      {step === "rate" && (
        <div className="flex flex-col items-center gap-4 py-2">
          <p className="text-sm text-ink-soft text-center">Your feedback helps other creators decide, and helps us improve.</p>
          <StarRating value={0} onChange={pickRating} size="lg" />
          <div className="flex items-center gap-4 mt-2">
            <button onClick={() => dismiss(false)} disabled={busy} className="text-xs font-semibold text-ink-soft hover:text-ink cursor-pointer">
              Remind me later
            </button>
            <button onClick={() => dismiss(true)} disabled={busy} className="text-xs font-semibold text-ink-soft hover:text-ink cursor-pointer">
              Don&apos;t ask again
            </button>
          </div>
        </div>
      )}

      {step === "details" && busy && mode === "edit" && !reviewId ? (
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
              className="w-full text-sm bg-white border border-card-border rounded-xl px-4 py-2.5 text-ink outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all"
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
              <span className={`text-xs ${form.body.trim().length > 0 && form.body.trim().length < REVIEW_BODY_MIN ? "text-red-500" : "text-ink-soft"}`}>
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
                  form.wouldRecommend === true ? "border-transparent grad-brand text-white" : "border-card-border text-ink-soft hover:bg-surface"
                }`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, wouldRecommend: false }))}
                className={`flex-1 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors cursor-pointer ${
                  form.wouldRecommend === false ? "border-transparent grad-brand text-white" : "border-card-border text-ink-soft hover:bg-surface"
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

          {mode === "edit" && (
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

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : mode === "edit" ? "Save changes" : "Submit review"}
          </Button>
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
          <div className="w-12 h-12 rounded-full grad-brand flex items-center justify-center text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="w-6 h-6">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-sm font-bold text-ink">{mode === "edit" ? "Your review has been updated" : "Thank you for your review!"}</p>
          <p className="text-xs text-ink-soft">{mode === "edit" ? "Changes to a published review are re-checked before going live again." : "It'll appear on our site once approved."}</p>
          <Button variant="primary" onClick={onClose}>Done</Button>
        </div>
      )}
    </Modal>
  );
}
