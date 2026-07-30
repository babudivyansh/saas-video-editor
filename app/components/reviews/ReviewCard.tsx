"use client";

import { useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import { Card } from "@/app/components/ui/Card";
import { Dropdown, DropdownItem } from "@/app/components/ui/Dropdown";
import { Tooltip } from "@/app/components/ui/Tooltip";
import { Modal } from "@/app/components/ui/Modal";
import { StarRating } from "@/app/components/reviews/StarRating";
import { ReportReviewModal } from "@/app/components/reviews/ReportReviewModal";
import { useAuth } from "@/app/components/AuthContext";
import { featureUsedLabel } from "@/lib/reviews/constants";
import type { PublicReviewDTO } from "@/lib/reviews/queries";
import type { ReviewBadge } from "@/lib/reviews/badges";

// See ReportReviewModal.tsx for why this is needed on the public /reviews page.
const COMMON_MESSAGES = { Common: { cancel: "Cancel", confirm: "Confirm", close: "Close" } };

const BADGE_LABEL: Record<ReviewBadge, string> = {
  verified_customer: "Verified customer",
  top_helpful: "Top helpful",
  power_user: "Power user",
  early_adopter: "Early adopter",
};

const BADGE_CLASS: Record<ReviewBadge, string> = {
  verified_customer: "text-emerald-700 bg-tint-emerald",
  top_helpful: "text-brand bg-tint-blue",
  power_user: "text-accent-violet bg-tint-violet",
  early_adopter: "text-accent-fuchsia bg-tint-fuchsia",
};

function IcCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IcThumbUp({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.75} className="w-3.5 h-3.5">
      <path d="M7 22V11m0 11H4a1 1 0 01-1-1v-9a1 1 0 011-1h3m0 11h9.3a2 2 0 002-1.7l1.4-8a2 2 0 00-2-2.3H14V4a2 2 0 00-2-2l-3 7v11z" strokeLinejoin="round" />
    </svg>
  );
}
function IcThumbDown({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.75} className="w-3.5 h-3.5 -scale-y-100">
      <path d="M7 22V11m0 11H4a1 1 0 01-1-1v-9a1 1 0 011-1h3m0 11h9.3a2 2 0 002-1.7l1.4-8a2 2 0 00-2-2.3H14V4a2 2 0 00-2-2l-3 7v11z" strokeLinejoin="round" />
    </svg>
  );
}
function IcDots() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
    </svg>
  );
}

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function ReviewCard({ review }: { review: PublicReviewDTO }) {
  const { token, openAuthModal } = useAuth();
  const [helpfulCount, setHelpfulCount] = useState(review.helpfulCount);
  const [notHelpfulCount, setNotHelpfulCount] = useState(review.notHelpfulCount);
  const [myVote, setMyVote] = useState<1 | -1 | null>(null);
  const [voting, setVoting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  async function vote(value: 1 | -1) {
    if (!token) { openAuthModal("login"); return; }
    if (voting) return;
    setVoting(true);
    const nextVote = myVote === value ? null : value;
    const prevVote = myVote;
    // Optimistic update
    setMyVote(nextVote);
    if (prevVote === 1) setHelpfulCount((c) => c - 1);
    if (prevVote === -1) setNotHelpfulCount((c) => c - 1);
    if (nextVote === 1) setHelpfulCount((c) => c + 1);
    if (nextVote === -1) setNotHelpfulCount((c) => c + 1);

    try {
      if (nextVote === null) {
        await fetch(`/api/reviews/${review.id}/vote`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      } else {
        await fetch(`/api/reviews/${review.id}/vote`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ value: nextVote }),
        });
      }
    } finally {
      setVoting(false);
    }
  }

  async function submitReport(reason: string, details: string) {
    if (!token) return;
    const res = await fetch(`/api/reviews/${review.id}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason, details: details || undefined }),
    });
    if (res.ok) setReported(true);
    setReportOpen(false);
  }

  return (
    <Card tint="none" padding="md" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          {review.author.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={review.author.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full grad-brand text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
              {initials(review.author.name)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink truncate">{review.author.name}</p>
            <p className="text-xs text-ink-soft">{formatDate(review.createdAt)}</p>
          </div>
        </div>

        <Dropdown
          align="right"
          trigger={({ toggle }) => (
            <button onClick={toggle} aria-label="Review actions" className="text-ink-soft/60 hover:text-ink-soft p-1 -m-1 rounded-full cursor-pointer">
              <IcDots />
            </button>
          )}
        >
          {({ close }) => (
            <div className="py-1.5">
              <DropdownItem
                onClick={() => { if (!token) { openAuthModal("login"); } else { setReportOpen(true); } close(); }}
                danger
              >
                {reported ? "Reported" : "Report review"}
              </DropdownItem>
            </div>
          )}
        </Dropdown>
      </div>

      <StarRating value={review.rating} readOnly size="sm" />

      {review.title && <p className="text-sm font-bold text-ink">{review.title}</p>}
      <p className="text-sm text-ink-soft leading-relaxed whitespace-pre-line">{review.body}</p>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wide text-brand bg-tint-blue rounded-full px-2 py-1">
          {featureUsedLabel(review.featureUsed)}
        </span>
        {review.verifiedCustomer && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-1 text-emerald-700 bg-tint-emerald">
            <IcCheck /> Verified
          </span>
        )}
        {review.badges.filter((b) => b !== "verified_customer").map((b) => (
          <span key={b} className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-1 ${BADGE_CLASS[b]}`}>
            {BADGE_LABEL[b]}
          </span>
        ))}
      </div>

      {review.attachments.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {review.attachments.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setLightboxIndex(i)}
              className="aspect-square rounded-xl overflow-hidden border border-card-border bg-surface cursor-pointer hover:opacity-90 transition-opacity"
            >
              {a.kind === "video" ? (
                <video src={a.url} className="w-full h-full object-cover" muted />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt="" className="w-full h-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}

      {review.reply && (
        <div className="rounded-xl bg-surface border border-card-border p-3">
          <p className="text-xs font-bold text-ink">Response from Clipiro</p>
          <p className="text-xs text-ink-soft mt-1 whitespace-pre-line">{review.reply.body}</p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-1 border-t border-card-border/60 mt-1">
        <Tooltip content={token ? "Helpful" : "Log in to vote"}>
          <button
            onClick={() => vote(1)}
            disabled={voting}
            aria-pressed={myVote === 1}
            aria-label={`Helpful (${helpfulCount})`}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1.5 transition-colors cursor-pointer ${
              myVote === 1 ? "text-brand bg-tint-blue" : "text-ink-soft hover:bg-surface"
            }`}
          >
            <IcThumbUp filled={myVote === 1} /> {helpfulCount}
          </button>
        </Tooltip>
        <Tooltip content={token ? "Not helpful" : "Log in to vote"}>
          <button
            onClick={() => vote(-1)}
            disabled={voting}
            aria-pressed={myVote === -1}
            aria-label={`Not helpful (${notHelpfulCount})`}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1.5 transition-colors cursor-pointer ${
              myVote === -1 ? "text-red-600 bg-tint-rose" : "text-ink-soft hover:bg-surface"
            }`}
          >
            <IcThumbDown filled={myVote === -1} /> {notHelpfulCount}
          </button>
        </Tooltip>
      </div>

      <ReportReviewModal open={reportOpen} onClose={() => setReportOpen(false)} onSubmit={submitReport} />

      {lightboxIndex !== null && review.attachments[lightboxIndex] && (
        <NextIntlClientProvider locale="en" messages={COMMON_MESSAGES}>
          <Modal open onClose={() => setLightboxIndex(null)} maxWidth="max-w-2xl">
            {review.attachments[lightboxIndex].kind === "video" ? (
              <video src={review.attachments[lightboxIndex].url} className="w-full rounded-xl max-h-[75vh]" controls autoPlay />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={review.attachments[lightboxIndex].url} alt="" className="w-full rounded-xl max-h-[75vh] object-contain" />
            )}
          </Modal>
        </NextIntlClientProvider>
      )}
    </Card>
  );
}
