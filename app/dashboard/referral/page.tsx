"use client";

// Affiliate dashboard (design B, "share-first"): a centered hero with the
// referral link in a big box — the same shape as Home's link box — and share
// chips under it, then full-width stats, recent referrals as cards, how it
// works, and a payout card beside them. Join / payout flows are unchanged.

import { useEffect, useState } from "react";
import { MIN_PAYOUT_AMOUNT } from "@/lib/affiliate-constants";

interface RecentReferral {
  id: string;
  /** Masked server-side: "a***@gmail.com". */
  label: string;
  signedUpAt: string;
  status: "converted" | "signed_up" | "review";
  commission: number;
}

interface AffiliateStats {
  enrolled: boolean;
  code?: string;
  referralLink?: string;
  totalReferrals?: number;
  convertedReferrals?: number;
  pendingAmount?: number;
  availableAmount?: number;
  totalEarned?: number;
  totalPaid?: number;
  recentReferrals?: RecentReferral[];
}

function token() {
  return typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : "";
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const STEPS = [
  { title: "Share your link", desc: "With friends, on social media, or in your community." },
  { title: "Friend signs up", desc: "They create a Clipiro account with your link — under a minute." },
  { title: "You earn 20%", desc: "Of their first payment, after a 30-day hold." },
];

const SHARE_TEXT = "I clip my long videos into shorts with Clipiro — try it:";

function shareLinks(link: string) {
  const url = encodeURIComponent(link);
  const text = encodeURIComponent(SHARE_TEXT);
  return [
    { label: "Share on X", href: `https://twitter.com/intent/tweet?text=${text}&url=${url}` },
    { label: "WhatsApp", href: `https://wa.me/?text=${text}%20${url}` },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${url}` },
    { label: "Email", href: `mailto:?subject=${encodeURIComponent("Try Clipiro")}&body=${text}%20${url}` },
  ];
}

const IcGift = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true"><path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" /></svg>;
const IcCheck = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>;

function StatusChip({ status }: { status: RecentReferral["status"] }) {
  const map = {
    converted: { label: "Converted", cls: "bg-success/15 text-success" },
    signed_up: { label: "Signed up", cls: "bg-surface-3 text-fg-muted" },
    review: { label: "Under review", cls: "bg-warning/15 text-warning" },
  }[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map.cls}`}>{map.label}</span>;
}

export default function ReferralPage() {
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [copied, setCopied] = useState(false);
  const [joining, setJoining] = useState(false);
  const [payoutRequesting, setPayoutRequesting] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState<{ text: string; ok: boolean } | null>(null);
  // Separate from payoutMsg, which only ever renders for enrolled members — a
  // join failure reported through it would be invisible.
  const [joinError, setJoinError] = useState("");
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    // `r.ok` first: an error body still parses, and piping one into `stats`
    // left `enrolled` undefined — read as false, so a member whose request
    // failed was shown the join pitch again. A failure gets its own state.
    fetch("/api/affiliate/stats", { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => (r.ok ? r.json() : null))
      .then((d: AffiliateStats | null) => (d ? setStats(d) : setStatsError(true)))
      .catch(() => setStatsError(true));
  }, []);

  async function handleJoin() {
    setJoining(true);
    try {
      const res = await fetch("/api/affiliate/join", {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json().catch(() => ({}));
      // Enrolment is what the SERVER says it is — never assumed before looking.
      if (!res.ok) {
        setJoinError(data.error ?? "Couldn't join the affiliate program. Please try again.");
        return;
      }
      setJoinError("");
      setStats({ enrolled: true, ...data, totalReferrals: 0, convertedReferrals: 0, pendingAmount: 0, availableAmount: 0, totalEarned: 0, totalPaid: 0, recentReferrals: [] });
    } catch {
      setJoinError("Couldn't reach the server. Please try again.");
    } finally {
      setJoining(false);
    }
  }

  async function handlePayoutRequest() {
    setPayoutRequesting(true);
    try {
      const res = await fetch("/api/affiliate/payout-request", {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
      });
      // A non-JSON error page makes .json() throw; the finally below keeps the
      // button from sticking on "Requesting…".
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setPayoutMsg({ text: data.error ?? "Couldn't submit your payout request. Please try again.", ok: false });
        return;
      }
      setPayoutMsg({ text: `Payout request submitted for ₹${(data.amount ?? 0).toFixed(2)}. Payouts are processed manually by our team, typically within a few business days.`, ok: true });
    } catch {
      setPayoutMsg({ text: "Couldn't reach the server. Please try again.", ok: false });
    } finally {
      setPayoutRequesting(false);
    }
  }

  function handleCopy() {
    if (!stats?.referralLink) return;
    navigator.clipboard.writeText(stats.referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const referralLink = stats?.referralLink ?? "";
  const available = stats?.availableAmount ?? 0;
  const referred = stats?.totalReferrals ?? 0;
  const converted = stats?.convertedReferrals ?? 0;
  const conversion = referred > 0 ? Math.round((converted / referred) * 100) : null;
  const payoutPct = Math.min(100, Math.round((available / MIN_PAYOUT_AMOUNT) * 100));
  const recent = stats?.recentReferrals ?? [];

  return (
    <div className="w-full px-4 sm:px-8 xl:px-12 pt-6 pb-16">
      {/* ── Hero ── */}
      <section className="mx-auto max-w-[800px] text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-success">Affiliate program</p>
        <h1 className="mt-2.5 text-[26px] sm:text-[34px] font-bold tracking-tight text-fg leading-tight">Earn 20% on every referral</h1>
        <p className="mx-auto mt-2.5 max-w-[560px] text-[15px] leading-relaxed text-fg-muted">
          Share your link. When a friend makes their first payment, 20% of it is yours — automatically, no limits.
        </p>

        {statsError && (
          <div role="alert" className="mt-8 rounded-2xl border border-error/30 bg-error/10 px-6 py-5">
            <p className="text-sm font-semibold text-fg">Couldn&apos;t load your affiliate status</p>
            <p className="mt-1 text-sm text-fg-muted">Please refresh the page to try again.</p>
          </div>
        )}

        {!stats && !statsError && (
          <div className="mt-7 h-[66px] rounded-[22px] bg-surface-2 animate-pulse" />
        )}

        {/* Not enrolled: the join call sits where the link box will be. */}
        {stats && !stats.enrolled && (
          <div className="mt-7 rounded-[22px] border border-fg/15 bg-surface-3 p-6">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-primary"><IcGift /></span>
            <p className="mt-3 text-base font-semibold text-fg">You&apos;re not enrolled yet</p>
            <p className="mt-1 text-sm text-fg-muted">Join to get your unique referral link and start earning.</p>
            <button
              type="button"
              onClick={handleJoin}
              disabled={joining}
              className="mt-5 h-12 rounded-2xl bg-fg px-7 text-base font-semibold text-bg hover:bg-fg/90 transition-colors disabled:opacity-60"
            >
              {joining ? "Setting up…" : "Join the affiliate program"}
            </button>
            {joinError && (
              <p role="alert" className="mt-3 rounded-lg border border-error/30 bg-error/10 px-4 py-2 text-sm text-error">{joinError}</p>
            )}
          </div>
        )}

        {/* Enrolled: the link box and share chips. */}
        {stats?.enrolled && (
          <>
            <div className="mt-7 flex flex-col sm:flex-row sm:items-center gap-2 rounded-[22px] border border-fg/15 bg-surface-3 p-1.5 sm:pl-5">
              <span className="min-w-0 flex-1 truncate px-3 py-2.5 sm:p-0 text-left font-mono text-sm sm:text-[15px] text-fg-muted select-all">{referralLink}</span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex h-12 sm:h-[52px] flex-shrink-0 items-center justify-center gap-2 rounded-2xl bg-fg px-7 text-base font-semibold text-bg hover:bg-fg/90 transition-colors"
              >
                {copied ? <><IcCheck /> Copied</> : "Copy link"}
              </button>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {shareLinks(referralLink).map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target={s.href.startsWith("mailto:") ? undefined : "_blank"}
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center rounded-xl border border-fg/12 px-3.5 text-[13px] font-medium text-fg hover:border-primary/40 hover:bg-surface-2 transition-colors"
                >
                  {s.label}
                </a>
              ))}
              <span className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-dashed border-fg/20 px-3.5 text-[13px] text-fg-muted">
                Code <span className="font-mono font-semibold text-fg">{stats.code}</span>
              </span>
            </div>
          </>
        )}
      </section>

      {stats?.enrolled && (
        <>
          {/* ── Stats ── */}
          <div className="mt-11 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5">
            <div className="rounded-2xl border border-line bg-surface-2 px-5 py-4">
              <p className="text-xs text-fg-muted">Friends referred</p>
              <p className="mt-2 text-[28px] font-bold tabular-nums text-fg">{referred}</p>
            </div>
            <div className="rounded-2xl border border-line bg-surface-2 px-5 py-4">
              <p className="text-xs text-fg-muted">Paid customers</p>
              <p className="mt-2 text-[28px] font-bold tabular-nums text-fg">
                {converted}
                {conversion != null && <span className="ml-2 text-sm font-semibold text-success">{conversion}%</span>}
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-surface-2 px-5 py-4">
              <p className="text-xs text-fg-muted">Pending · 30-day hold</p>
              <p className="mt-2 text-[28px] font-bold tabular-nums text-warning">{inr(stats.pendingAmount ?? 0)}</p>
            </div>
            <div className="rounded-2xl border border-line bg-surface-2 px-5 py-4">
              <p className="text-xs text-fg-muted">Available</p>
              <p className="mt-2 text-[28px] font-bold tabular-nums text-success">{inr(available)}</p>
            </div>
          </div>

          <div className="mt-9 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-9">
              {/* ── Referrals ── */}
              <section>
                <div className="mb-3.5 flex items-baseline justify-between gap-3 px-1.5">
                  <h2 className="text-base font-medium text-fg-muted">Your referrals</h2>
                  <span className="text-xs text-fg-subtle">Emails are masked</span>
                </div>
                {recent.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-line px-6 py-8 text-center">
                    <p className="text-sm font-semibold text-fg">No referrals yet</p>
                    <p className="mt-1 text-sm text-fg-muted">Share your link above — friends who sign up with it show up here.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-3">
                    {recent.map((r) => (
                      <div key={r.id} className="rounded-2xl border border-line bg-surface-2 p-4">
                        <div className="flex items-center gap-2.5">
                          <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full font-bold uppercase ${r.status === "converted" ? "bg-success/15 text-success" : "bg-surface-3 text-fg-muted"}`}>
                            {r.label[0] ?? "?"}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-fg">{r.label}</span>
                            <span className="block text-xs text-fg-subtle">
                              Signed up {new Date(r.signedUpAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                            </span>
                          </span>
                        </div>
                        <div className="mt-3.5 flex items-center justify-between text-[13px]">
                          <StatusChip status={r.status} />
                          {r.commission > 0
                            ? <span className="font-bold text-fg">+{inr(r.commission)}</span>
                            : <span className="text-fg-subtle">No payment yet</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* ── How it works ── */}
              <section>
                <h2 className="mb-3.5 px-1.5 text-base font-medium text-fg-muted">How it works</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {STEPS.map((s, i) => (
                    <div key={s.title} className="rounded-2xl border border-line bg-surface-2 p-4">
                      <span className="text-sm font-bold text-primary">{i + 1}</span>
                      <p className="mt-1.5 text-sm font-semibold text-fg">{s.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-fg-muted">{s.desc}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* ── Payout ── */}
            <aside>
              <section className="rounded-2xl border border-line bg-surface-2 p-5 sm:p-6 xl:sticky xl:top-6">
                <h2 className="text-[15px] font-semibold text-fg">Payout</h2>
                <p className="mt-3.5 text-4xl font-bold tabular-nums text-success">{inr(available)}</p>
                <p className="mt-0.5 text-[13px] text-fg-muted">available · {inr(MIN_PAYOUT_AMOUNT)} minimum</p>
                <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={payoutPct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to the payout minimum">
                  <div className="h-full rounded-full bg-success" style={{ width: `${payoutPct}%` }} />
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-fg-subtle">
                  {available < MIN_PAYOUT_AMOUNT
                    ? `${inr(MIN_PAYOUT_AMOUNT - available)} more to request a payout. `
                    : "You can request a payout now. "}
                  Payouts are processed manually, typically within a few business days.
                </p>
                <button
                  type="button"
                  onClick={handlePayoutRequest}
                  disabled={available < MIN_PAYOUT_AMOUNT || payoutRequesting}
                  className="mt-4 h-12 w-full rounded-full bg-fg text-[15px] font-semibold text-bg hover:bg-fg/90 transition-colors disabled:bg-surface-3 disabled:text-fg-subtle disabled:cursor-not-allowed"
                >
                  {payoutRequesting ? "Requesting…" : available >= MIN_PAYOUT_AMOUNT ? `Request ${inr(available)}` : "Request payout"}
                </button>
                {payoutMsg && (
                  <p
                    role={payoutMsg.ok ? undefined : "alert"}
                    className={`mt-3 rounded-lg border px-4 py-2 text-sm ${payoutMsg.ok ? "border-success/30 bg-success/10 text-success" : "border-error/30 bg-error/10 text-error"}`}
                  >
                    {payoutMsg.text}
                  </p>
                )}
                <p className="mt-4 text-xs text-fg-subtle">
                  Total earned {inr(stats.totalEarned ?? 0)} · Paid out {inr(stats.totalPaid ?? 0)} ·{" "}
                  <a href="/affiliate-tos" className="underline hover:text-fg-muted">Full terms</a>
                </p>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
