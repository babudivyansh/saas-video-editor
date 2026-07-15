"use client";

// New Personal Info page: UID, Nickname + Phone, Password (inline reset),
// Gender, "intended use", and the Danger Zone (sign out all devices + delete
// account). Reuses the existing PATCH /api/auth/profile and
// POST /api/auth/change-password endpoints; delete account calls the new
// DELETE /api/auth/profile route.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthContext";

function IcUser() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>; }
function IcLock() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>; }
function IcCopy() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>; }
function IcCheck() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M5 13l4 4L19 7" /></svg>; }
function IcSpinner() { return <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />; }

const inputCls = "w-full bg-white border border-card-border rounded-xl px-4 py-3 text-sm text-ink placeholder:text-ink-soft/50 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all";
const labelCls = "text-xs font-semibold text-ink-soft uppercase tracking-wide block mb-1.5";

const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "unspecified", label: "Prefer not to say" },
];

const INTENDED_USES = [
  { value: "content_creator", label: "Content Creator" },
  { value: "business_marketing", label: "Business / Marketing" },
  { value: "personal", label: "Personal" },
  { value: "other", label: "Other" },
];

export default function PersonalInfoPage() {
  const { user, token, signOut, refreshUser } = useAuth();
  const router = useRouter();

  // Restart onboarding
  const [restarting, setRestarting] = useState(false);

  // Nickname + phone
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // UID copy
  const [uidCopied, setUidCopied] = useState(false);

  // Password reset (inline expand)
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Gender / intended use
  const [gender, setGender] = useState<string | null>(null);
  const [intendedUse, setIntendedUse] = useState<string | null>(null);
  const [savingChoice, setSavingChoice] = useState<"gender" | "intendedUse" | null>(null);

  // Delete account
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => { setDisplayName(user?.name ?? ""); }, [user?.name]);
  useEffect(() => { setPhone(user?.phone ?? ""); }, [user?.phone]);
  useEffect(() => { setGender(user?.gender ?? null); }, [user?.gender]);
  useEffect(() => { setIntendedUse(user?.intendedUse ?? null); }, [user?.intendedUse]);

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
      const data = (await res.json()) as { error?: string };
      if (res.ok) { setNameMsg({ type: "success", text: "Profile updated." }); await refreshUser(); }
      else setNameMsg({ type: "error", text: data.error ?? "Failed to update profile." });
    } finally {
      setSavingName(false);
    }
  }

  function copyUid() {
    if (!user?.id) return;
    navigator.clipboard.writeText(user.id).then(() => {
      setUidCopied(true);
      setTimeout(() => setUidCopied(false), 2000);
    });
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) { setPwMsg({ type: "error", text: "New passwords do not match." }); return; }
    if (newPw.length < 8) { setPwMsg({ type: "error", text: "Password must be at least 8 characters." }); return; }
    setPwLoading(true);
    setPwMsg(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = (await res.json()) as { error?: string };
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

  async function saveChoice(field: "gender" | "intendedUse", value: string) {
    setSavingChoice(field);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        if (field === "gender") setGender(value); else setIntendedUse(value);
        await refreshUser();
      }
    } finally {
      setSavingChoice(null);
    }
  }

  async function handleRestartOnboarding() {
    setRestarting(true);
    try {
      await fetch("/api/onboarding/restart", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      await refreshUser();
      // One-time signal so the dashboard shows the welcome screen even though
      // this user has real projects (the usual hasAnyProjects gate exists to
      // protect pre-existing users from seeing it unprompted, not to block an
      // explicit restart).
      sessionStorage.setItem("clipiro:restartOnboarding", "1");
      router.push("/dashboard");
    } finally {
      setRestarting(false);
    }
  }

  async function handleDeleteAccount() {
    if (!confirm("This permanently deletes your account, videos, and purchase history. This cannot be undone. Continue?")) return;
    if (!deletePw) { setDeleteError("Enter your password to confirm."); return; }
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: deletePw }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setDeleteError(data.error ?? "Failed to delete account.");
        return;
      }
      signOut();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-extrabold grad-text inline-block">Personal Info</h1>

      {/* UID */}
      <div className="bg-white rounded-[var(--radius-card)] border border-card-border p-6">
        <label className={labelCls}>UID</label>
        <div className="flex items-center gap-2 bg-surface border border-card-border rounded-xl px-4 py-3">
          <span className="text-xs text-gray-500 font-mono flex-1 truncate">{user?.id ?? "—"}</span>
          <button onClick={copyUid} title="Copy UID" className="text-ink-soft/60 hover:text-brand transition-colors cursor-pointer">
            {uidCopied ? <IcCheck /> : <IcCopy />}
          </button>
        </div>
      </div>

      {/* Nickname + Phone */}
      <div className="bg-white rounded-[var(--radius-card)] border border-card-border p-6 space-y-4">
        <div className="flex items-center gap-2"><IcUser /><h2 className="text-base font-extrabold text-ink">Edit Profile</h2></div>
        <form onSubmit={handleSaveName} className="space-y-4">
          <div>
            <label className={labelCls}>Nickname</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" maxLength={60} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Phone Number</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Email Address</label>
            <div className="flex items-center gap-2 bg-surface border border-card-border rounded-xl px-4 py-3">
              <span className="text-sm text-gray-700 flex-1 truncate">{user?.email ?? "—"}</span>
              <span className="text-[10px] font-semibold text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full flex-shrink-0">Read only</span>
            </div>
          </div>
          {nameMsg && (
            <div className={`text-sm font-medium px-4 py-3 rounded-xl ${nameMsg.type === "success" ? "bg-tint-emerald text-green-700" : "bg-red-50 text-red-600"}`}>{nameMsg.text}</div>
          )}
          <button type="submit" disabled={savingName} className="w-full flex items-center justify-center gap-2 grad-brand hover:brightness-105 disabled:opacity-60 text-white text-sm font-semibold py-3 rounded-full shadow-glow hover:shadow-glow-hover transition-all cursor-pointer">
            {savingName ? <><IcSpinner /> Saving…</> : "Save Changes"}
          </button>
        </form>
      </div>

      {/* Password */}
      <div className="bg-white rounded-[var(--radius-card)] border border-card-border p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><IcLock /><h2 className="text-base font-extrabold text-ink">Password</h2></div>
          <button onClick={() => setPwOpen((o) => !o)} className="text-sm font-semibold text-brand hover:underline cursor-pointer">
            {pwOpen ? "Cancel" : "Reset Password"}
          </button>
        </div>
        {!pwOpen ? (
          <p className="mt-3 text-sm tracking-widest text-gray-400">••••••••</p>
        ) : (
          <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
            {[
              { label: "Current Password", value: currentPw, setter: setCurrentPw, placeholder: "Enter current password" },
              { label: "New Password", value: newPw, setter: setNewPw, placeholder: "At least 8 characters" },
              { label: "Confirm New Password", value: confirmPw, setter: setConfirmPw, placeholder: "Repeat new password" },
            ].map((f) => (
              <div key={f.label}>
                <label className={labelCls}>{f.label}</label>
                <input type="password" value={f.value} onChange={(e) => f.setter(e.target.value)} placeholder={f.placeholder} required className={inputCls} />
              </div>
            ))}
            {pwMsg && (
              <div className={`text-sm font-medium px-4 py-3 rounded-xl ${pwMsg.type === "success" ? "bg-tint-emerald text-green-700" : "bg-red-50 text-red-600"}`}>{pwMsg.text}</div>
            )}
            <button type="submit" disabled={pwLoading} className="w-full flex items-center justify-center gap-2 grad-brand hover:brightness-105 disabled:opacity-60 text-white text-sm font-semibold py-3 rounded-full shadow-glow hover:shadow-glow-hover transition-all cursor-pointer">
              {pwLoading ? <><IcSpinner /> Updating…</> : "Update Password"}
            </button>
          </form>
        )}
      </div>

      {/* Gender */}
      <div className="bg-white rounded-[var(--radius-card)] border border-card-border p-6">
        <label className={labelCls}>Gender</label>
        <div className="flex items-center gap-5 mt-2">
          {GENDERS.map((g) => (
            <label key={g.value} className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
              <input
                type="radio"
                name="gender"
                checked={gender === g.value}
                onChange={() => saveChoice("gender", g.value)}
                disabled={savingChoice === "gender"}
                className="accent-brand"
              />
              {g.label}
            </label>
          ))}
        </div>
      </div>

      {/* Intended use */}
      <div className="bg-white rounded-[var(--radius-card)] border border-card-border p-6">
        <label className={labelCls}>What is your intended use for Clipiro?</label>
        <div className="flex flex-wrap gap-2 mt-2">
          {INTENDED_USES.map((o) => (
            <button
              key={o.value}
              onClick={() => saveChoice("intendedUse", o.value)}
              disabled={savingChoice === "intendedUse"}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                intendedUse === o.value ? "grad-brand text-white shadow-glow" : "bg-white border border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Onboarding */}
      <div className="bg-white rounded-[var(--radius-card)] border border-card-border p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-ink">Restart onboarding tour</p>
            <p className="text-xs text-gray-400 mt-0.5">Replay the welcome screen and guided tour next time you visit the dashboard.</p>
          </div>
          <button
            onClick={handleRestartOnboarding}
            disabled={restarting}
            className="flex-shrink-0 flex items-center gap-2 text-sm font-semibold text-brand border border-violet-200 hover:bg-tint-blue disabled:opacity-60 px-5 py-2 rounded-xl transition-colors cursor-pointer"
          >
            {restarting ? <><IcSpinner /> Restarting…</> : "Restart Tour"}
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-white rounded-[var(--radius-card)] border border-red-100 p-6 space-y-5">
        <h2 className="text-base font-extrabold text-red-600">Danger Zone</h2>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-4 border-t border-red-50">
          <div>
            <p className="text-sm font-semibold text-ink">Sign out of all devices</p>
            <p className="text-xs text-gray-400 mt-0.5">Invalidates your current session and signs you out.</p>
          </div>
          <button onClick={signOut} className="flex-shrink-0 text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 px-5 py-2 rounded-xl transition-colors cursor-pointer">
            Sign Out
          </button>
        </div>

        <div className="pt-4 border-t border-red-50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-ink">Delete Account</p>
              <p className="text-xs text-gray-400 mt-0.5">Permanently deletes your account, videos, and purchase history.</p>
            </div>
            {!deleteOpen ? (
              <button onClick={() => setDeleteOpen(true)} className="flex-shrink-0 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 px-5 py-2 rounded-xl transition-colors cursor-pointer">
                Delete Account
              </button>
            ) : null}
          </div>
          {deleteOpen && (
            <div className="mt-4 space-y-3">
              <input
                type="password"
                value={deletePw}
                onChange={(e) => { setDeletePw(e.target.value); setDeleteError(null); }}
                placeholder="Enter your password to confirm"
                className={inputCls}
              />
              {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setDeleteOpen(false); setDeletePw(""); setDeleteError(null); }} className="text-sm font-semibold text-gray-600 hover:text-gray-900 px-4 py-2 rounded-xl transition-colors cursor-pointer">
                  Cancel
                </button>
                <button onClick={handleDeleteAccount} disabled={deleting} className="flex items-center gap-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 px-5 py-2 rounded-xl transition-colors cursor-pointer">
                  {deleting ? <><IcSpinner /> Deleting…</> : "Permanently Delete"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
