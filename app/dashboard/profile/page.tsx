"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import ToolsSidebar from "@/app/components/ToolsSidebar";
import { useAuth } from "@/app/components/AuthContext";
import { useRazorpayCheckout } from "@/app/components/useRazorpayCheckout";

// ── Icons ─────────────────────────────────────────────────────────────────────
function IcVideo()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>; }
function IcDownload() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>; }
function IcTrash()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>; }
function IcEye()      { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>; }
function IcLock()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>; }
function IcUser()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>; }
function IcZap()      { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>; }
function IcCheck()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M5 13l4 4L19 7"/></svg>; }
function IcCopy()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>; }
function IcCamera()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>; }
function IcCard()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>; }
function IcShield()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>; }
function IcSpinner()  { return <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />; }
function IcPlus()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M12 5v14M5 12h14"/></svg>; }
function IcRefresh()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>; }
function IcReceipt()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>; }
function IcCalendar() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>; }

// ── Types ─────────────────────────────────────────────────────────────────────
interface Project {
  id: string;
  title: string;
  productType: string;
  status: string;
  videoUrl: string | null;
  uploadedVideoUrl: string | null;
  backgroundUrl: string;
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

interface Pack {
  id: string;
  slug: string;
  name: string;
  priceInPaise: number;
  credits: number;
  kind: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const PRODUCT_LABELS: Record<string, string> = {
  "split-screen":   "Split Screen",
  "streamer-video": "Streamer Video",
  "reddit-video":   "Reddit Story",
  "text-video":     "Fake Text",
};

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  rendering: "bg-blue-100 text-blue-700",
  failed:    "bg-red-100 text-red-600",
  draft:     "bg-gray-100 text-gray-500",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatINR(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

function daysBetween(from: Date, to: Date) {
  return Math.ceil((+to - +from) / (1000 * 60 * 60 * 24));
}

function ProductBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    "split-screen":   "bg-purple-100 text-purple-700",
    "streamer-video": "bg-orange-100 text-orange-700",
    "reddit-video":   "bg-red-100 text-red-700",
    "text-video":     "bg-teal-100 text-teal-700",
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${colors[type] ?? "bg-gray-100 text-gray-600"}`}>
      {PRODUCT_LABELS[type] ?? type}
    </span>
  );
}

// ── Credit ring (inline SVG, no chart lib) ─────────────────────────────────────
function CreditRing({ credits, denom }: { credits: number; denom: number }) {
  const r = 46;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, denom > 0 ? credits / denom : 0));
  const offset = circ * (1 - pct);
  return (
    <div className="relative w-32 h-32 flex-shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#f1f5f9" strokeWidth="12" />
        <circle
          cx="60" cy="60" r={r} fill="none" stroke="#2563eb" strokeWidth="12"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-gray-900 leading-none">{credits}</span>
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mt-1">credits</span>
      </div>
    </div>
  );
}

// ── Video Card ────────────────────────────────────────────────────────────────
function VideoCard({ project, token, onDelete }: { project: Project; token: string; onDelete: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied]     = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete "${project.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      onDelete(project.id);
    } finally {
      setDeleting(false);
    }
  }

  function handleCopy() {
    if (!project.videoUrl) return;
    navigator.clipboard.writeText(project.videoUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const thumb = project.backgroundUrl
    ? project.backgroundUrl.replace("/video.mp4", "/thumbnail.webp")
    : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* Thumbnail */}
      <div className="relative bg-gray-50" style={{ paddingBottom: "56.25%" }}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={project.title} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <IcVideo />
          </div>
        )}
        {/* Status overlay */}
        <div className="absolute top-2 left-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[project.status] ?? STATUS_STYLES.draft}`}>
            {project.status === "rendering" ? "⏳ Rendering" : project.status.charAt(0).toUpperCase() + project.status.slice(1)}
          </span>
        </div>
        {/* Video preview play button if completed */}
        {project.status === "completed" && project.videoUrl && (
          <a href={project.videoUrl} target="_blank" rel="noopener noreferrer"
            className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity">
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-gray-900 ml-0.5"><path d="M5 3l14 9-14 9V3z"/></svg>
            </div>
          </a>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{project.title}</p>
          <ProductBadge type={project.productType} />
        </div>
        <p className="text-xs text-gray-400 mb-3">{formatDate(project.createdAt)}</p>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {project.status === "completed" && project.videoUrl ? (
            <>
              <a href={project.videoUrl} download
                className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg transition-colors">
                <IcDownload /> Download
              </a>
              <button onClick={handleCopy} title="Copy link"
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors">
                {copied ? <IcCheck /> : <IcCopy />}
              </button>
              <a href={project.videoUrl} target="_blank" rel="noopener noreferrer" title="Preview"
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors">
                <IcEye />
              </a>
            </>
          ) : (
            <div className="flex-1 flex items-center gap-2 text-xs text-gray-400 py-1">
              {project.status === "rendering" && <IcSpinner />}
              <span>{project.status === "rendering" ? "Processing your video…" : project.status === "failed" ? "Generation failed" : "Draft — not generated yet"}</span>
            </div>
          )}
          <button onClick={handleDelete} disabled={deleting} title="Delete"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-gray-400 transition-colors flex-shrink-0">
            {deleting ? <IcSpinner /> : <IcTrash />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { user, token, signOut, refreshUser } = useAuth();
  const { startCheckout, activeId } = useRazorpayCheckout();
  const [tab, setTab]             = useState<"videos" | "billing" | "settings">("videos");
  const [projects, setProjects]   = useState<Project[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState("all");

  // Purchase history
  const [purchases, setPurchases]             = useState<Purchase[]>([]);
  const [purchasesLoaded, setPurchasesLoaded] = useState(false);

  // Top-up packs (lazy-loaded with the billing tab)
  const [packs, setPacks]           = useState<Pack[]>([]);
  const [packsLoaded, setPacksLoaded] = useState(false);

  // Top-up coupon (applies to the next pack purchase)
  const [couponInput, setCouponInput]       = useState("");
  const [couponApplying, setCouponApplying] = useState(false);
  const [couponError, setCouponError]       = useState("");
  const [appliedCoupon, setAppliedCoupon]   = useState<{ code: string; label: string } | null>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Profile edit state
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone]             = useState("");
  const [savingName, setSavingName]   = useState(false);
  const [nameMsg, setNameMsg]         = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password change state
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw]         = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg]         = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchProjects = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/projects", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json() as { projects: Project[] };
        setProjects(data.projects);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  // Seed the editable fields once the user loads
  useEffect(() => { setDisplayName(user?.name ?? ""); }, [user?.name]);
  useEffect(() => { setPhone(user?.phone ?? ""); }, [user?.phone]);

  // Lazy-load purchases + packs when the billing tab is first opened
  useEffect(() => {
    if (tab !== "billing" || !token) return;
    if (!purchasesLoaded) {
      fetch("/api/auth/purchases", { headers: { Authorization: `Bearer ${token}` } })
        .then(res => (res.ok ? res.json() : { purchases: [] }))
        .then((data: { purchases: Purchase[] }) => setPurchases(data.purchases ?? []))
        .catch(() => setPurchases([]))
        .finally(() => setPurchasesLoaded(true));
    }
    if (!packsLoaded) {
      fetch("/api/plans")
        .then(res => (res.ok ? res.json() : { plans: [] }))
        .then((data: { plans: Pack[] }) => setPacks((data.plans ?? []).filter(p => p.kind === "pack")))
        .catch(() => setPacks([]))
        .finally(() => setPacksLoaded(true));
    }
  }, [tab, purchasesLoaded, packsLoaded, token]);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    setNameMsg(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: displayName, phone }),
      });
      const data = await res.json() as { error?: string };
      if (res.ok) {
        setNameMsg({ type: "success", text: "Profile updated." });
        await refreshUser();
      } else {
        setNameMsg({ type: "error", text: data.error ?? "Failed to update profile." });
      }
    } finally {
      setSavingName(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNameMsg({ type: "error", text: "Please choose an image file." });
      return;
    }
    setUploadingAvatar(true);
    setNameMsg(null);
    try {
      // Reuse the existing S3-backed upload route, then persist the URL.
      const form = new FormData();
      form.append("file", file);
      const up = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const upData = await up.json() as { url?: string; error?: string };
      if (!up.ok || !upData.url) throw new Error(upData.error ?? "Upload failed");

      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ avatarUrl: upData.url }),
      });
      if (!res.ok) throw new Error("Failed to save avatar");
      setNameMsg({ type: "success", text: "Avatar updated." });
      await refreshUser();
    } catch (err) {
      setNameMsg({ type: "error", text: err instanceof Error ? err.message : "Avatar upload failed." });
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) { setPwMsg({ type: "error", text: "New passwords do not match." }); return; }
    if (newPw.length < 8)    { setPwMsg({ type: "error", text: "Password must be at least 8 characters." }); return; }
    setPwLoading(true);
    setPwMsg(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json() as { error?: string };
      if (res.ok) {
        setPwMsg({ type: "success", text: "Password updated successfully." });
        setCurrentPw(""); setNewPw(""); setConfirmPw("");
      } else {
        setPwMsg({ type: "error", text: data.error ?? "Failed to update password." });
      }
    } finally {
      setPwLoading(false);
    }
  }

  function handleBuyCredits(pack: Pack) {
    startCheckout({
      planId: pack.slug,
      couponCode: appliedCoupon?.code,
      onSuccess: () => {
        // Payment is already verified + credits granted server-side by the time
        // this fires (see useRazorpayCheckout handler). Refresh to reflect it.
        showToast("✓ Payment confirmed — your credits have been added.");
        refreshUser();
        setTimeout(() => refreshUser(), 2500);
      },
    });
  }

  // Validate the top-up coupon against the cheapest pack as a proxy (per-user /
  // first-purchase rules are user-level; min-amount only relaxes on pricier packs).
  async function applyTopupCoupon() {
    const cheapest = [...packs].sort((a, b) => a.priceInPaise - b.priceInPaise)[0];
    if (!couponInput.trim() || !cheapest) return;
    setCouponApplying(true);
    setCouponError("");
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planId: cheapest.slug, code: couponInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setAppliedCoupon(null);
        setCouponError(data.error ?? "Could not apply coupon.");
        return;
      }
      setAppliedCoupon({ code: data.code, label: data.label });
    } catch {
      setCouponError("Could not apply coupon. Try again.");
    } finally {
      setCouponApplying(false);
    }
  }

  // Filtered projects
  const filtered = filter === "all" ? projects : projects.filter(p => p.productType === filter);

  // Stats
  const completed = projects.filter(p => p.status === "completed").length;
  const rendering = projects.filter(p => p.status === "rendering").length;

  const memberSince = user?.createdAt ? formatDate(user.createdAt) : "—";
  const planName    = user?.plan?.name ?? "Free Plan";
  const isAdmin     = user?.role === "ADMIN";

  // Plan status
  const endsAt        = user?.subscriptionEndsAt ? new Date(user.subscriptionEndsAt) : null;
  const hasActivePlan = !!endsAt && endsAt > new Date();
  const daysLeft      = endsAt ? daysBetween(new Date(), endsAt) : 0;
  const expiringSoon  = hasActivePlan && daysLeft <= 7;
  const monthlyCredits = user?.monthlyCredits ?? 0;
  const ringDenom      = monthlyCredits > 0 ? monthlyCredits : Math.max(user?.credits ?? 0, 1);

  // Usage history derived from projects (each generated video = 1 credit)
  const usage = projects
    .filter(p => p.status === "completed")
    .slice()
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  // Usage-over-time sparkline: last 14 days bucketed by day
  const usageByDay = (() => {
    const days: { label: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      const count = usage.filter(p => {
        const t = +new Date(p.createdAt);
        return t >= +d && t < +next;
      }).length;
      days.push({ label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), count });
    }
    return days;
  })();
  const maxUsage = Math.max(1, ...usageByDay.map(d => d.count));

  const FILTERS = [
    { id: "all",            label: "All" },
    { id: "split-screen",   label: "Split Screen" },
    { id: "streamer-video", label: "Streamer" },
    { id: "reddit-video",   label: "Reddit Story" },
    { id: "text-video",     label: "Fake Text" },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <ToolsSidebar active="profile" />

      <main className="flex-1 overflow-y-auto">
        {/* Topbar */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-gray-400 hover:text-gray-700 transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M15 18l-6-6 6-6"/></svg>
            </Link>
            <h1 className="text-xl font-bold text-gray-900">Profile</h1>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Link href="/admin"
                className="flex items-center gap-1.5 text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 py-1.5 rounded-lg transition-colors">
                <IcShield /> Admin
              </Link>
            )}
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-8 py-8 space-y-8">

          {/* ── Hero header ── */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-blue-800 shadow-lg">
            <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/10" />
            <div className="absolute -bottom-16 -left-8 w-40 h-40 rounded-full bg-white/5" />
            <div className="relative p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-6">
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                {user?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt="avatar" className="w-20 h-20 rounded-2xl object-cover shadow-md ring-2 ring-white/40" />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-white text-3xl font-extrabold select-none shadow-md ring-2 ring-white/40">
                    {(user?.name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
                  </div>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  title="Change avatar"
                  className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-full bg-white shadow flex items-center justify-center text-gray-600 hover:text-blue-600 transition-colors"
                >
                  {uploadingAvatar ? <IcSpinner /> : <IcCamera />}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 text-white">
                <p className="text-2xl font-bold truncate">{user?.name || user?.email || "—"}</p>
                {user?.name && <p className="text-sm text-blue-100 truncate">{user?.email}</p>}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold bg-white/20 text-white px-3 py-1 rounded-full backdrop-blur">
                    <IcZap /> {planName}
                  </span>
                  <span className="text-xs text-blue-100">Member since {memberSince}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                {(expiringSoon || !hasActivePlan) && (
                  <Link href="/pricing"
                    className="inline-flex items-center gap-1.5 bg-white text-blue-700 text-sm font-bold px-5 py-2.5 rounded-xl transition-all shadow-sm hover:bg-blue-50">
                    <IcRefresh /> {hasActivePlan ? "Renew" : "Subscribe"}
                  </Link>
                )}
                <Link href="/pricing"
                  className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 backdrop-blur text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all border border-white/20">
                  <IcZap /> Upgrade
                </Link>
              </div>
            </div>
          </div>

          {/* ── Plan & Credits panel ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 md:gap-8 items-center">
              {/* Credit ring */}
              <div className="flex items-center justify-center md:justify-start">
                <CreditRing credits={user?.credits ?? 0} denom={ringDenom} />
              </div>

              {/* Plan facts */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-gray-900">Plan &amp; Credits</h2>
                  <span className="text-xs font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{planName}</span>
                  {user?.veo3Enabled ? (
                    <span className="text-xs font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">✦ Veo3 enabled</span>
                  ) : (
                    <span className="text-xs font-medium bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Veo3 not included</span>
                  )}
                </div>

                {hasActivePlan ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Monthly credits</p>
                        <p className="text-lg font-bold text-gray-900">{monthlyCredits || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Renews / expires</p>
                        <p className="text-lg font-bold text-gray-900">{endsAt ? formatDate(endsAt.toISOString()) : "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Next refill</p>
                        <p className="text-lg font-bold text-gray-900">{user?.nextRefillAt ? formatDate(user.nextRefillAt) : "—"}</p>
                      </div>
                    </div>

                    {/* Days-left bar */}
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className={`font-semibold ${expiringSoon ? "text-amber-600" : "text-gray-500"}`}>
                          <IcCalendar /> {daysLeft} day{daysLeft === 1 ? "" : "s"} left in term
                        </span>
                        {expiringSoon && (
                          <Link href="/pricing" className="font-bold text-blue-600 hover:underline">Renew now →</Link>
                        )}
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${expiringSoon ? "bg-amber-500" : "bg-blue-500"}`}
                          style={{ width: `${Math.max(4, Math.min(100, (daysLeft / 30) * 100))}%` }}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">No active subscription</p>
                      <p className="text-xs text-gray-500 mt-0.5">Subscribe to get monthly credits and unlock top-up packs.</p>
                    </div>
                    <Link href="/pricing"
                      className="flex-shrink-0 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
                      <IcZap /> View plans
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
              {[
                { label: "Total Videos", value: projects.length },
                { label: "Completed",    value: completed },
                { label: "Rendering",    value: rendering },
                { label: "Credits Left", value: user?.credits ?? 0 },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            {([["videos", "My Videos"], ["billing", "Billing & Usage"], ["settings", "Account Settings"]] as const).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${tab === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                {label}
              </button>
            ))}
          </div>

          {/* ── Videos tab ── */}
          {tab === "videos" && (
            <div className="space-y-5">
              {/* Filter row */}
              <div className="flex items-center gap-2 flex-wrap">
                {FILTERS.map(f => (
                  <button key={f.id} onClick={() => setFilter(f.id)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${filter === f.id ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                    {f.label}
                    {f.id === "all" && <span className="ml-1.5 text-[10px] opacity-70">{projects.length}</span>}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
                  <IcSpinner /> <span className="text-sm">Loading your videos…</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
                    <IcVideo />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-700">No videos yet</p>
                    <p className="text-sm text-gray-400 mt-1">Generate your first video to see it here.</p>
                  </div>
                  <Link href="/dashboard"
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
                    <IcZap /> Create a video
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {filtered.map(p => (
                    <VideoCard key={p.id} project={p} token={token!} onDelete={id => setProjects(prev => prev.filter(x => x.id !== id))} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Billing & Usage tab ── */}
          {tab === "billing" && (
            <div className="space-y-6">

              {/* Buy Credits */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-1">
                  <div>
                    <div className="flex items-center gap-2">
                      <IcZap />
                      <h2 className="text-base font-bold text-gray-900">Top Up Credits</h2>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">One-time purchase · credits never expire · added instantly after payment.</p>
                  </div>

                  {/* Coupon (active subscribers only) */}
                  {hasActivePlan && packsLoaded && packs.length > 0 && (
                    <div className="flex-shrink-0">
                      {appliedCoupon ? (
                        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                          <span className="text-xs font-bold text-green-700">🎟 {appliedCoupon.code} · {appliedCoupon.label}</span>
                          <button onClick={() => { setAppliedCoupon(null); setCouponInput(""); }} className="text-xs text-green-700 hover:text-green-900 underline">Remove</button>
                        </div>
                      ) : (
                        <div>
                          <div className="flex gap-2">
                            <input
                              value={couponInput}
                              onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(""); }}
                              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyTopupCoupon(); } }}
                              placeholder="Coupon code"
                              className="w-36 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                              onClick={applyTopupCoupon}
                              disabled={couponApplying || !couponInput.trim()}
                              className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 transition-colors"
                            >
                              {couponApplying ? "…" : "Apply"}
                            </button>
                          </div>
                          {couponError && <p className="text-xs text-red-600 mt-1.5 text-right">{couponError}</p>}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {appliedCoupon && (
                  <p className="text-xs text-green-600 mb-4">Discount applies at checkout to the pack you buy.</p>
                )}

                {!hasActivePlan ? (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Top-up packs require an active subscription</p>
                      <p className="text-xs text-gray-500 mt-0.5">Subscribe to any plan, then buy credit packs anytime.</p>
                    </div>
                    <Link href="/pricing"
                      className="flex-shrink-0 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
                      <IcZap /> Subscribe to unlock
                    </Link>
                  </div>
                ) : !packsLoaded ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400 py-6"><IcSpinner /> Loading packs…</div>
                ) : packs.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4">No credit packs are available right now.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {packs.map(pack => {
                      const isBuying = activeId === pack.slug;
                      return (
                        <div key={pack.id} className="rounded-xl border-2 border-gray-200 hover:border-blue-300 transition-all p-5 flex flex-col text-center shadow-sm">
                          <p className="text-sm font-bold text-gray-900">{pack.name}</p>
                          <p className="text-2xl font-black text-gray-900 mt-2">{formatINR(pack.priceInPaise)}</p>
                          <p className="text-xs text-gray-500 mt-1 mb-4">{pack.credits.toLocaleString("en-IN")} credits</p>
                          <button
                            onClick={() => handleBuyCredits(pack)}
                            disabled={!!activeId}
                            className="mt-auto w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                          >
                            {isBuying ? (
                              <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Buying…</>
                            ) : (
                              <><IcPlus /> Buy</>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Purchase history */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <IcCard />
                    <h2 className="text-base font-bold text-gray-900">Purchase History</h2>
                  </div>
                  {!purchasesLoaded ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400 py-6"><IcSpinner /> Loading…</div>
                  ) : purchases.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-sm text-gray-500 font-medium">No purchases yet</p>
                      <p className="text-xs text-gray-400 mt-1">Your credit pack purchases will appear here.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {purchases.map(p => (
                        <div key={p.id} className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{p.plan?.name ?? "Credit Pack"}</p>
                            <p className="text-xs text-gray-400">{formatDate(p.createdAt)} · +{p.credits} credits</p>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="text-right">
                              <p className="text-sm font-bold text-gray-900">{formatINR(p.amountInPaise)}</p>
                              <span className="text-[10px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full capitalize">{p.status}</span>
                            </div>
                            <Link
                              href={`/dashboard/profile/receipt/${p.id}`}
                              target="_blank"
                              title="View receipt"
                              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-white hover:border-blue-200 hover:text-blue-600 text-gray-400 transition-colors"
                            >
                              <IcReceipt />
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Usage history + sparkline */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <IcVideo />
                    <h2 className="text-base font-bold text-gray-900">Credit Usage</h2>
                  </div>

                  {loading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400 py-6"><IcSpinner /> Loading…</div>
                  ) : usage.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-sm text-gray-500 font-medium">No usage yet</p>
                      <p className="text-xs text-gray-400 mt-1">Credit cost varies by tool (1–20 credits).</p>
                    </div>
                  ) : (
                    <>
                      {/* Sparkline — last 14 days */}
                      <div className="mb-5">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Last 14 days</p>
                        <div className="flex items-end gap-1 h-20">
                          {usageByDay.map((d, i) => (
                            <div key={i} className="flex-1 flex flex-col justify-end group relative" title={`${d.label}: ${d.count}`}>
                              <div
                                className="w-full bg-blue-500/80 group-hover:bg-blue-600 rounded-sm transition-all"
                                style={{ height: `${(d.count / maxUsage) * 100}%`, minHeight: d.count > 0 ? "4px" : "2px", opacity: d.count > 0 ? 1 : 0.25 }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 max-h-72 overflow-y-auto">
                        {usage.map(p => (
                          <div key={p.id} className="flex items-center justify-between py-2.5 px-4 bg-gray-50 rounded-xl">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">{p.title}</p>
                              <p className="text-xs text-gray-400">{formatDate(p.createdAt)}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <ProductBadge type={p.productType} />
                              <span className="text-xs font-bold text-red-500">−1</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Settings tab ── */}
          {tab === "settings" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Edit profile card */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
                <div className="flex items-center gap-2 mb-1">
                  <IcUser />
                  <h2 className="text-base font-bold text-gray-900">Edit Profile</h2>
                </div>
                <form onSubmit={handleSaveName} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Display Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      placeholder="Your name"
                      maxLength={60}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Phone Number</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Email Address</label>
                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                      <span className="text-sm text-gray-700 flex-1">{user?.email ?? "—"}</span>
                      <span className="text-[10px] font-semibold text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">Read only</span>
                    </div>
                  </div>

                  {nameMsg && (
                    <div className={`text-sm font-medium px-4 py-3 rounded-xl ${nameMsg.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                      {nameMsg.text}
                    </div>
                  )}

                  <button type="submit" disabled={savingName}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold py-3 rounded-xl transition-colors">
                    {savingName ? <><IcSpinner /> Saving…</> : "Save Changes"}
                  </button>
                </form>

                <div className="pt-4 border-t border-gray-100">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">User ID</label>
                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                    <span className="text-xs text-gray-400 font-mono">{user?.id ?? "—"}</span>
                  </div>
                </div>
              </div>

              {/* Change password card */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-5">
                  <IcLock />
                  <h2 className="text-base font-bold text-gray-900">Change Password</h2>
                </div>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  {[
                    { label: "Current Password", value: currentPw, setter: setCurrentPw, placeholder: "Enter current password" },
                    { label: "New Password",      value: newPw,     setter: setNewPw,     placeholder: "At least 8 characters" },
                    { label: "Confirm New Password", value: confirmPw, setter: setConfirmPw, placeholder: "Repeat new password" },
                  ].map(field => (
                    <div key={field.label}>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{field.label}</label>
                      <input
                        type="password"
                        value={field.value}
                        onChange={e => field.setter(e.target.value)}
                        placeholder={field.placeholder}
                        required
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>
                  ))}

                  {pwMsg && (
                    <div className={`text-sm font-medium px-4 py-3 rounded-xl ${pwMsg.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                      {pwMsg.text}
                    </div>
                  )}

                  <button type="submit" disabled={pwLoading}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold py-3 rounded-xl transition-colors">
                    {pwLoading ? <><IcSpinner /> Updating…</> : "Update Password"}
                  </button>
                </form>
              </div>

              {/* Danger zone */}
              <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6 lg:col-span-2">
                <h2 className="text-base font-bold text-red-600 mb-4">Danger Zone</h2>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-4 border-t border-red-50">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Sign out of all devices</p>
                    <p className="text-xs text-gray-400 mt-0.5">Invalidates your current session and signs you out.</p>
                  </div>
                  <button onClick={signOut}
                    className="flex-shrink-0 text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 px-5 py-2 rounded-xl transition-colors">
                    Sign Out
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>
      </main>

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-[fadeIn_0.2s_ease-out]">
          <span className="text-green-400"><IcCheck /></span>
          {toast}
        </div>
      )}
    </div>
  );
}
