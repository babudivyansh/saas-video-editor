"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import { useRazorpayCheckout } from "@/app/components/useRazorpayCheckout";
import { useTopupCoupon } from "@/app/components/useTopupCoupon";
import { PlansModal } from "@/app/components/billing/PlansModal";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { CreditRing } from "@/app/components/ui/CreditRing";
import { StatTile } from "@/app/components/ui/StatTile";
import { UsageBarChart } from "@/app/components/ui/UsageBarChart";
import { formatDate, formatINR } from "@/lib/format";

interface DbPlan {
  id: string;
  slug: string;
  name: string;
  priceInPaise: number;
  currency: string;
  credits: number;
  kind: string;
}

interface LaunchCoupon {
  code: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  appliesTo: string;
  expiresAt: string | null;
}

interface GenerationSummary {
  totalCreditsUsed: number;
  byModel: { modelId: string | null; toolSlug: string; displayName: string; count: number; creditsCost: number }[];
  byDay: { date: string; credits: number }[];
  byTool: { toolSlug: string; count: number; creditsCost: number }[];
}

interface GenerationRow {
  id: string;
  toolSlug: string;
  modelId: string | null;
  displayName: string;
  generationType: string;
  creditsCost: number;
  status: string;
  createdAt: string;
}

interface Purchase {
  id: string;
  amountInPaise: number;
  credits: number;
  status: string;
  createdAt: string;
  plan: { name: string; slug: string } | null;
}

function formatPrice(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

function daysUntil(date: Date) {
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

// "Renews"/"Access ends" framing (not a bare "Expires" date) so an
// auto-renewing plan doesn't read as about to lapse.
function renewalLabel(daysLeft: number, cancelled: boolean) {
  const verb = cancelled ? "Access ends" : "Renews";
  if (daysLeft <= 0) return `${verb} today`;
  if (daysLeft === 1) return `${verb} tomorrow`;
  return `${verb} in ${daysLeft} days`;
}

// Low-balance threshold — mirrors the auto-topup prompt's own trigger point
// (lib/credits.ts maybeAutoTopup) so the two nudges agree on "low."
const LOW_BALANCE_THRESHOLD = 10;

function Spinner() {
  return <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-tint-emerald text-green-700",
    pending: "bg-tint-blue text-brand",
    failed: "bg-red-50 text-red-600",
    refunded: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${map[status] ?? "bg-gray-100 text-gray-500"}`}>
      {status}
    </span>
  );
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "usage", label: "Usage" },
  { key: "topup", label: "Top Up" },
  { key: "history", label: "Payment History" },
] as const;
type TabKey = typeof TABS[number]["key"];

function BillingContent() {
  const router = useRouter();
  const params = useSearchParams();
  const success = params.get("success");
  const tab: TabKey = (TABS.find(t => t.key === params.get("tab"))?.key) ?? "overview";
  const { user, token, refreshUser } = useAuth();
  const { startCheckout, activeId } = useRazorpayCheckout();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [packs, setPacks] = useState<DbPlan[]>([]);
  const [addons, setAddons] = useState<DbPlan[]>([]);
  const [launch, setLaunch] = useState<LaunchCoupon | null>(null);
  const [copied, setCopied] = useState(false);
  const [plansModalOpen, setPlansModalOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);

  // Usage tab data — real Generation-ledger-backed (Phase 1/3), replacing the
  // old Project-derived bar chart and its hardcoded "−1 credit" display.
  const [summary, setSummary] = useState<GenerationSummary | null>(null);
  const [history, setHistory] = useState<GenerationRow[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);

  // Payment history tab data
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchasesLoaded, setPurchasesLoaded] = useState(false);

  // Top-up coupon — shared hook, validated against the cheapest pack as a
  // representative preview (server-side checkout re-validates against the
  // real cart regardless, so this only affects the discount preview shown
  // before a specific pack is chosen, not what's actually charged).
  const cheapestPackSlug = [...packs].sort((a, b) => a.priceInPaise - b.priceInPaise)[0]?.slug ?? "";
  const coupon = useTopupCoupon({ planId: cheapestPackSlug });

  useEffect(() => {
    if (!token) { router.push("/login"); return; }

    Promise.all([
      fetch("/api/plans").then(r => r.ok ? r.json() : { plans: [] }),
      fetch("/api/coupons/active").then(r => r.ok ? r.json() : { coupons: [] }),
      fetch("/api/generations/summary?range=30d", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null),
      fetch("/api/generations?limit=20", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : { generations: [], nextCursor: null }),
      fetch("/api/auth/purchases", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : { purchases: [] }),
    ]).then(([plansData, couponData, summaryData, historyData, purchasesData]) => {
      const all: DbPlan[] = plansData.plans ?? [];
      setPacks(all.filter(p => p.kind === "pack"));
      setAddons(all.filter(p => p.kind === "addon"));
      const featured: LaunchCoupon[] = couponData.coupons ?? [];
      if (featured.length > 0) setLaunch(featured[0]);
      if (summaryData) setSummary(summaryData);
      setHistory(historyData.generations ?? []);
      setHistoryCursor(historyData.nextCursor ?? null);
      setPurchases(purchasesData.purchases ?? []);
      setPurchasesLoaded(true);
    }).catch(() => setError("Failed to load billing data."))
      .finally(() => setLoading(false));
  }, [token, router]);

  async function loadMoreHistory() {
    if (!historyCursor || historyLoadingMore) return;
    setHistoryLoadingMore(true);
    try {
      const res = await fetch(`/api/generations?limit=20&cursor=${historyCursor}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setHistory(prev => [...prev, ...(data.generations ?? [])]);
        setHistoryCursor(data.nextCursor ?? null);
      }
    } finally {
      setHistoryLoadingMore(false);
    }
  }

  const endsAt = user?.subscriptionEndsAt ? new Date(user.subscriptionEndsAt) : null;
  const hasActivePlan = !!endsAt && endsAt > new Date();
  const daysLeft = endsAt ? daysUntil(endsAt) : 0;

  const allowance = user?.monthlyCredits ?? 0;
  const balance = user?.credits ?? 0;
  const used = Math.max(0, allowance - balance);

  function setTab(next: TabKey) {
    router.push(next === "overview" ? "/billing" : `/billing?tab=${next}`);
  }

  function handleBuy(slug: string) {
    setError("");
    startCheckout({
      planId: slug,
      couponCode: coupon.appliedCoupon?.code,
      onSuccess: () => { refreshUser(); router.push("/billing?success=1"); },
      onError: setError,
    });
  }

  // Reuses the exact same success path as top-up purchases (handleBuy above) —
  // refresh the cached user object and reveal the existing ?success=1 banner —
  // rather than inventing a separate confirmation for plan/subscription
  // purchases made through the new modal.
  function handlePlanPurchaseSuccess() {
    refreshUser();
    router.push("/billing?success=1");
  }

  async function handleCancelSubscription() {
    if (!token) return;
    setCancelling(true);
    setError("");
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Couldn't cancel your subscription."); return; }
      await refreshUser();
      setCancelSuccess(true);
    } catch {
      setError("Couldn't cancel your subscription.");
    } finally {
      setCancelling(false);
    }
  }

  function copyLaunchCode() {
    if (!launch) return;
    navigator.clipboard?.writeText(launch.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-6 h-6 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold grad-text inline-block">Billing</h1>
        <p className="text-sm text-ink-soft mt-1">Manage your plan, credits, and usage.</p>
      </div>

      {/* ── Launch offer banner ── */}
      {launch && (
        <div className="relative overflow-hidden rounded-[var(--radius-card)] grad-hero px-6 py-5 text-white shadow-glow">
          <div className="clipiro-blob absolute -right-6 -top-8 h-32 w-32 rounded-full bg-white/15 blur-2xl pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/80">🚀 Launch Special</p>
              <p className="mt-1 font-bold leading-snug">
                {launch.description ?? `${launch.discountValue}% off your plan`}
              </p>
              {launch.expiresAt && (
                <p className="text-xs text-white/70 mt-0.5">
                  Ends {new Date(launch.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </p>
              )}
            </div>
            <button
              onClick={copyLaunchCode}
              className="flex-shrink-0 inline-flex items-center gap-2 rounded-full bg-white/15 hover:bg-white/25 border border-white/30 px-4 py-2.5 font-mono font-bold tracking-wider transition-colors cursor-pointer"
            >
              {launch.code}
              <span className="text-xs font-sans font-semibold text-white/80">{copied ? "Copied!" : "Copy"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Success / error banners */}
      {success && (
        <div className="bg-tint-emerald border border-green-200 text-green-800 rounded-2xl px-5 py-3.5 text-sm font-medium flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 flex-shrink-0">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Payment successful — credits will appear in your account shortly!
        </div>
      )}
      {cancelSuccess && (
        <div className="bg-tint-emerald border border-green-200 text-green-800 rounded-2xl px-5 py-3.5 text-sm font-medium flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 flex-shrink-0">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Subscription cancelled — you'll keep access until {user?.subscriptionEndsAt ? formatDate(user.subscriptionEndsAt) : "the end of your billing period"}.
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl px-5 py-3.5 text-sm font-medium">
          {error}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-gray-100 -mb-1 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
              tab === t.key ? "border-brand text-brand" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab
          user={user}
          hasActivePlan={hasActivePlan}
          daysLeft={daysLeft}
          allowance={allowance}
          balance={balance}
          used={used}
          summary={summary}
          onViewPlans={() => setPlansModalOpen(true)}
          onGoToTopup={() => setTab("topup")}
          onCancelClick={() => setCancelDialogOpen(true)}
        />
      )}

      {tab === "usage" && (
        <UsageTab
          summary={summary}
          history={history}
          historyCursor={historyCursor}
          historyLoadingMore={historyLoadingMore}
          onLoadMore={loadMoreHistory}
        />
      )}

      {tab === "topup" && (
        <TopupTab
          hasActivePlan={hasActivePlan}
          packs={packs}
          addons={addons}
          activeId={activeId}
          onBuy={handleBuy}
          coupon={coupon}
          onViewPlans={() => setPlansModalOpen(true)}
        />
      )}

      {tab === "history" && <HistoryTab purchases={purchases} purchasesLoaded={purchasesLoaded} />}

      <p className="text-center text-xs text-ink-soft/60 pb-6">
        Payments powered by Razorpay · Secure &amp; encrypted
      </p>

      {plansModalOpen && (
        <PlansModal
          onClose={() => setPlansModalOpen(false)}
          onPurchaseSuccess={handlePlanPurchaseSuccess}
        />
      )}

      <ConfirmDialog
        open={cancelDialogOpen}
        title="Cancel subscription?"
        message={`You'll keep access to your plan until ${user?.subscriptionEndsAt ? formatDate(user.subscriptionEndsAt) : "the end of your billing period"} — you just won't be charged again after that.`}
        confirmLabel={cancelling ? "Cancelling…" : "Cancel subscription"}
        danger
        onConfirm={handleCancelSubscription}
        onClose={() => setCancelDialogOpen(false)}
      />
    </div>
  );
}

// ── Overview tab ─────────────────────────────────────────────────────────────
function OverviewTab({ user, hasActivePlan, daysLeft, allowance, balance, used, summary, onViewPlans, onGoToTopup, onCancelClick }: {
  user: ReturnType<typeof useAuth>["user"];
  hasActivePlan: boolean;
  daysLeft: number;
  allowance: number;
  balance: number;
  used: number;
  summary: GenerationSummary | null;
  onViewPlans: () => void;
  onGoToTopup: () => void;
  onCancelClick: () => void;
}) {
  const expiringSoon = hasActivePlan && daysLeft <= 7;
  const memberSince = user?.createdAt ? formatDate(user.createdAt) : "—";
  const cancelled = !!user?.subscriptionCancelledAt;
  const generationsThisMonth = summary?.byTool.reduce((s, t) => s + t.count, 0) ?? 0;
  const lowBalance = hasActivePlan && balance > 0 && balance < LOW_BALANCE_THRESHOLD;

  return (
    <div className="space-y-6">
      {hasActivePlan ? (
        <Card className="p-6 space-y-5">
          <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="inline-block bg-tint-emerald text-green-700 text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                  Active Plan
                </span>
                <span className="text-sm font-semibold text-ink truncate">{user?.plan?.name ?? "Subscription"}</span>
                {cancelled && (
                  <span className="inline-block bg-gray-100 text-ink-soft text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                    Cancelled
                  </span>
                )}
              </div>
              <p className={`text-sm font-medium ${expiringSoon ? "text-red-600" : "text-ink-soft"}`}>
                {renewalLabel(daysLeft, cancelled)}
              </p>
              <p className="text-xs text-ink-soft/70 mt-1">Member since {memberSince}</p>
              <div className="flex items-center gap-4 mt-2">
                <button onClick={onViewPlans} className="inline-flex items-center gap-1 text-xs text-brand hover:text-brand-dark font-medium transition-colors cursor-pointer">
                  Manage plan
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                    <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {!cancelled && (
                  <button onClick={onCancelClick} className="text-xs text-ink-soft/60 hover:text-red-600 font-medium transition-colors cursor-pointer">
                    Cancel subscription
                  </button>
                )}
              </div>
            </div>

            {allowance > 0 && (
              <div className="flex items-center gap-4 bg-tint-violet rounded-2xl px-5 py-4">
                <CreditRing used={used} total={allowance} />
                <div>
                  <p className="text-xs text-ink-soft font-medium">Monthly credits</p>
                  <p className="text-sm font-bold text-ink mt-0.5">{used} / {allowance} used</p>
                  <p className="text-xs text-ink-soft mt-0.5">Total balance: <span className="font-semibold text-ink">{balance}</span></p>
                  {generationsThisMonth > 0 && (
                    <p className="text-xs text-ink-soft/70 mt-0.5">
                      {generationsThisMonth} generation{generationsThisMonth === 1 ? "" : "s"} in the last 30 days
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {lowBalance && (
            <div className="flex items-center justify-between gap-3 bg-tint-amber border border-amber-100 rounded-2xl px-4 py-3">
              <p className="text-xs text-ink font-medium">Running low on credits ({balance} left).</p>
              <button onClick={onGoToTopup} className="flex-shrink-0 text-xs font-bold text-brand hover:text-brand-dark transition-colors cursor-pointer">
                Top up →
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatTile label="Monthly credits" value={allowance || "—"} accent="blue" />
            <StatTile
              label={cancelled ? "Access until" : "Renews"}
              value={user?.subscriptionEndsAt ? formatDate(user.subscriptionEndsAt) : "—"}
              accent="violet"
            />
            <StatTile label="Next refill" value={user?.nextRefillAt ? formatDate(user.nextRefillAt) : "—"} accent="fuchsia" />
          </div>

          {!cancelled && user?.plan?.priceInPaise ? (
            <p className="text-xs text-ink-soft/70">
              Next charge {formatINR(user.plan.priceInPaise)} on {user?.subscriptionEndsAt ? formatDate(user.subscriptionEndsAt) : "—"}.
            </p>
          ) : null}
        </Card>
      ) : (
        <Card tint="violet" className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-ink">You don&apos;t have an active subscription</p>
            <p className="text-sm text-ink-soft mt-1">Subscribe to get monthly credits and unlock top-up packs.</p>
          </div>
          <Button variant="primary" size="lg" onClick={onViewPlans} className="flex-shrink-0">View Plans</Button>
        </Card>
      )}
    </div>
  );
}

// ── Usage tab ────────────────────────────────────────────────────────────────
function UsageTab({ summary, history, historyCursor, historyLoadingMore, onLoadMore }: {
  summary: GenerationSummary | null;
  history: GenerationRow[];
  historyCursor: string | null;
  historyLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-extrabold text-ink">Usage (last 30 days)</h2>
          <p className="text-sm font-bold grad-text inline-block">{summary?.totalCreditsUsed ?? 0} credits</p>
        </div>
        <UsageBarChart data={summary?.byDay ?? []} />
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-extrabold text-ink mb-4">Top models</h2>
        {!summary || summary.byModel.length === 0 ? (
          <p className="text-sm text-ink-soft/70 py-4 text-center">No usage yet — generate something to see a breakdown here.</p>
        ) : (
          <div className="space-y-2">
            {summary.byModel.slice(0, 8).map(m => (
              <div key={`${m.toolSlug}-${m.modelId ?? "none"}`} className="flex items-center justify-between py-2 px-3 bg-surface rounded-lg">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{m.displayName}</p>
                  <p className="text-xs text-ink-soft/70">{m.count} generation{m.count === 1 ? "" : "s"}</p>
                </div>
                <p className="text-sm font-bold text-ink flex-shrink-0">{m.creditsCost} cr</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-extrabold text-ink mb-4">History</h2>
        {history.length === 0 ? (
          <p className="text-sm text-ink-soft/70 py-4 text-center">No generations yet.</p>
        ) : (
          <>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {history.map(g => (
                <div key={g.id} className="flex items-center justify-between py-2.5 px-4 bg-surface rounded-xl">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{g.displayName}</p>
                    <p className="text-xs text-ink-soft/70">{formatDate(g.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge status={g.status} />
                    <span className="text-xs font-bold text-ink">−{g.creditsCost}</span>
                  </div>
                </div>
              ))}
            </div>
            {historyCursor && (
              <div className="text-center mt-4">
                <Button variant="secondary" size="sm" onClick={onLoadMore} disabled={historyLoadingMore}>
                  {historyLoadingMore ? <><Spinner /> Loading…</> : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

// ── Auto top-up toggle (2026-07 audit) ──────────────────────────────────────
// Opt-in: when the balance drops below 10 credits after a spend, the account
// gets a one-click top-up email for the chosen pack (see lib/credits.ts's
// maybeAutoTopup — true instant recurring charges mostly can't complete in
// India without a pre-registered mandate, so the email IS the "auto" path).
function AutoTopupToggle({ packs }: { packs: DbPlan[] }) {
  const { token } = useAuth();
  const [slug, setSlug] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch("/api/billing/auto-topup", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : { autoTopupPackSlug: null }))
      .then((data: { autoTopupPackSlug: string | null }) => setSlug(data.autoTopupPackSlug))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [token]);

  async function update(next: string | null) {
    if (!token) return;
    setSaving(true);
    setSlug(next); // optimistic
    try {
      await fetch("/api/billing/auto-topup", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ packSlug: next }),
      });
    } finally {
      setSaving(false);
    }
  }

  if (!loaded || packs.length === 0) return null;
  const enabled = slug != null;
  const selected = packs.find((p) => p.slug === slug) ?? packs[0];

  return (
    <Card className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-bold text-ink text-sm">Auto top-up</p>
          {enabled && <span className="text-[10px] font-bold bg-tint-emerald text-green-700 px-2 py-0.5 rounded-full uppercase tracking-wide">On</span>}
        </div>
        <p className="text-xs text-ink-soft mt-1">
          {enabled
            ? `We'll email you a one-click link to buy ${selected?.name ?? "a pack"} whenever your balance drops below 10 credits.`
            : "Get a one-click reminder to top up whenever your balance runs low — never get blocked mid-render."}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {enabled && (
          <select
            value={slug ?? ""}
            onChange={(e) => update(e.target.value)}
            disabled={saving}
            className="text-xs font-semibold border border-card-border rounded-lg px-2.5 py-2 bg-surface text-ink"
          >
            {packs.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
          </select>
        )}
        <button
          role="switch"
          aria-checked={enabled}
          onClick={() => update(enabled ? null : (packs[0]?.slug ?? null))}
          disabled={saving}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${enabled ? "bg-green-500" : "bg-ink-soft/30"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : ""}`} />
        </button>
      </div>
    </Card>
  );
}

// ── Top Up tab ───────────────────────────────────────────────────────────────
function TopupTab({ hasActivePlan, packs, addons, activeId, onBuy, coupon, onViewPlans }: {
  hasActivePlan: boolean;
  packs: DbPlan[];
  addons: DbPlan[];
  activeId: string | null;
  onBuy: (slug: string) => void;
  coupon: ReturnType<typeof useTopupCoupon>;
  onViewPlans: () => void;
}) {
  if (!hasActivePlan) {
    return (
      <Card tint="violet" className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-ink">Top-up packs require an active subscription</p>
          <p className="text-sm text-ink-soft mt-1">Subscribe to any plan, then buy credit packs anytime.</p>
        </div>
        <Button variant="primary" size="lg" onClick={onViewPlans} className="flex-shrink-0">View Plans</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <AutoTopupToggle packs={packs} />
      <section>
        <div className="mb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-extrabold text-ink">Top-up Credits</h2>
            <p className="text-sm text-ink-soft mt-0.5">One-time purchase · credits never expire · added to your account instantly.</p>
          </div>
          <div className="flex-shrink-0">
            {coupon.appliedCoupon ? (
              <div className="flex items-center gap-2 bg-tint-emerald border border-green-200 rounded-full px-3 py-2">
                <span className="text-xs font-bold text-green-700">🎟 {coupon.appliedCoupon.code} · {coupon.appliedCoupon.label}</span>
                <button onClick={coupon.clear} className="text-xs text-green-700 hover:text-green-900 underline cursor-pointer">Remove</button>
              </div>
            ) : (
              <div>
                <div className="flex gap-2">
                  <input
                    value={coupon.couponInput}
                    onChange={e => coupon.setCouponInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); coupon.apply(); } }}
                    placeholder="Coupon code"
                    className="w-36 bg-white border border-card-border rounded-full px-3.5 py-2 text-sm font-semibold uppercase tracking-wide outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all"
                  />
                  <Button variant="secondary" size="md" onClick={coupon.apply} disabled={coupon.applying || !coupon.couponInput.trim()}>
                    {coupon.applying ? "…" : "Apply"}
                  </Button>
                </div>
                {coupon.error && <p className="text-xs text-red-600 mt-1.5 text-right">{coupon.error}</p>}
              </div>
            )}
          </div>
        </div>

        {coupon.appliedCoupon && (
          <p className="text-xs text-green-600 -mt-2 mb-4">Discount applies at checkout to the pack you buy.</p>
        )}

        {packs.length === 0 ? (
          <p className="text-sm text-ink-soft/60 py-6 text-center">No credit packs are available right now.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {packs.map((pack, i) => {
              const isLoading = activeId === pack.slug;
              const isPopular = i === 1;
              return (
                <div
                  key={pack.id}
                  className={`relative bg-white rounded-[var(--radius-card)] border transition-all flex flex-col overflow-hidden hover:shadow-card-hover hover:-translate-y-0.5 ${
                    isPopular ? "border-violet-300 shadow-glow" : "border-card-border hover:border-violet-200"
                  }`}
                >
                  {isPopular && (
                    <div className="grad-brand text-white text-[10px] font-bold text-center py-1 tracking-widest uppercase">Most Popular</div>
                  )}
                  <div className="p-5 flex flex-col flex-1 text-center">
                    <p className="text-sm font-bold text-ink">{pack.name}</p>
                    <p className="text-3xl font-black grad-text inline-block my-3">{pack.credits}</p>
                    <p className="text-xs text-ink-soft mb-4">credits · never expire</p>
                    <p className="text-lg font-extrabold text-ink mb-5">{formatPrice(pack.priceInPaise)}</p>
                    <Button variant="primary" size="md" onClick={() => onBuy(pack.slug)} disabled={!!activeId} className="mt-auto w-full">
                      {isLoading ? (<><Spinner /> Opening…</>) : "Buy now"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {addons.length > 0 && (
        <section>
          <div className="mb-5">
            <h2 className="text-lg font-extrabold text-ink">Feature Add-ons</h2>
            <p className="text-sm text-ink-soft mt-0.5">One-time unlocks that enhance your plan.</p>
          </div>
          <div className="space-y-3">
            {addons.map(addon => {
              const isLoading = activeId === addon.slug;
              return (
                <Card key={addon.id} className="flex items-center gap-5 px-6 py-5 hover:border-violet-200 transition-colors">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 grad-brand text-white">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-ink text-sm">{addon.name}</p>
                      <span className="text-[10px] font-bold bg-tint-violet text-accent-violet px-2 py-0.5 rounded-full uppercase tracking-wide">One-time unlock</span>
                    </div>
                    <p className="text-xs text-ink-soft mt-0.5">Unlock {addon.name} for your plan.</p>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-4">
                    <p className="text-lg font-extrabold text-ink">{formatPrice(addon.priceInPaise)}</p>
                    <Button variant="primary" size="md" onClick={() => onBuy(addon.slug)} disabled={!!activeId}>
                      {isLoading ? (<><Spinner /> Opening…</>) : `Unlock ${addon.name}`}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Payment History tab ──────────────────────────────────────────────────────
function HistoryTab({ purchases, purchasesLoaded }: { purchases: Purchase[]; purchasesLoaded: boolean }) {
  return (
    <Card className="p-6">
      <h2 className="text-base font-extrabold text-ink mb-4">Purchase History</h2>
      {!purchasesLoaded ? (
        <div className="flex items-center gap-2 text-sm text-ink-soft py-6"><Spinner /> Loading…</div>
      ) : purchases.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-sm text-ink font-semibold">No purchases yet</p>
          <p className="text-xs text-ink-soft mt-1">Your credit pack purchases will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {purchases.map(p => (
            <div key={p.id} className="flex items-center justify-between py-3 px-4 bg-surface rounded-xl">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink truncate">{p.plan?.name ?? "Credit Pack"}</p>
                <p className="text-xs text-ink-soft/70">{formatDate(p.createdAt)} · +{p.credits} credits</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right">
                  <p className="text-sm font-bold text-ink">{formatINR(p.amountInPaise)}</p>
                  <span className="text-[10px] font-semibold text-green-700 bg-tint-emerald px-2 py-0.5 rounded-full capitalize">{p.status}</span>
                </div>
                <Link
                  href={`/dashboard/profile/receipt/${p.id}`}
                  target="_blank"
                  title="View receipt"
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-card-border hover:bg-tint-blue hover:text-brand text-ink-soft/60 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z" />
                    <path d="M8 7h8M8 11h8M8 15h5" />
                  </svg>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-32">
        <div className="w-6 h-6 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    }>
      <BillingContent />
    </Suspense>
  );
}
