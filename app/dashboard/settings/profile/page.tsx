"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthContext";
import { useToast } from "@/app/components/ui/Toast";
import { Card } from "@/app/components/ui/Card";
import { Button } from "@/app/components/ui/Button";

function IcCamera() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>; }
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

export default function ProfileSettingsPage() {
  const { user, token, refreshUser } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [uidCopied, setUidCopied] = useState(false);
  const [gender, setGender] = useState<string | null>(null);
  const [intendedUse, setIntendedUse] = useState<string | null>(null);
  const [savingChoice, setSavingChoice] = useState<"gender" | "intendedUse" | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDisplayName(user?.name ?? ""); }, [user?.name]);
  useEffect(() => { setPhone(user?.phone ?? ""); }, [user?.phone]);
  useEffect(() => { setGender(user?.gender ?? null); }, [user?.gender]);
  useEffect(() => { setIntendedUse(user?.intendedUse ?? null); }, [user?.intendedUse]);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: displayName, phone }),
      });
      const data = await res.json();
      if (res.ok) { showToast("Profile updated"); await refreshUser(); }
      else showToast(data.error ?? "Failed to update profile", "error");
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
      } else {
        showToast("Failed to save", "error");
      }
    } finally {
      setSavingChoice(null);
    }
  }

  async function handleRestartOnboarding() {
    setRestarting(true);
    try {
      await fetch("/api/onboarding/restart", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      await refreshUser();
      sessionStorage.setItem("clipiro:restartOnboarding", "1");
      router.push("/dashboard");
    } finally {
      setRestarting(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { showToast("Please choose an image file", "error"); return; }
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const up = await fetch("/api/upload?skipAsset=true", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const upData = (await up.json()) as { url?: string; error?: string };
      if (!up.ok || !upData.url) throw new Error(upData.error ?? "Upload failed");
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ avatarUrl: upData.url }),
      });
      if (!res.ok) throw new Error("Failed to save avatar");
      await refreshUser();
      showToast("Avatar updated");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Avatar upload failed", "error");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-extrabold grad-text inline-block">Profile</h1>
        <p className="text-sm text-ink-soft mt-1">Your identity and how Clipiro personalizes your experience.</p>
      </div>

      {/* Avatar */}
      <Card padding="md" className="flex items-center gap-4">
        <div className="relative flex-shrink-0">
          {user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="avatar" className="w-16 h-16 rounded-full object-cover shadow-sm" />
          ) : (
            <div className="w-16 h-16 rounded-full grad-brand flex items-center justify-center text-white text-2xl font-extrabold">
              {(user?.name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
            </div>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            title="Change avatar"
            className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white shadow border border-card-border flex items-center justify-center text-ink-soft hover:text-brand transition-colors cursor-pointer"
          >
            {uploadingAvatar ? <div className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" /> : <IcCamera />}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>
        <div>
          <p className="text-sm font-bold text-ink">{user?.name || "Your profile photo"}</p>
          <p className="text-xs text-ink-soft mt-0.5">JPG or PNG, shown across Clipiro and in shared links.</p>
        </div>
      </Card>

      {/* UID */}
      <Card padding="md">
        <label className={labelCls}>UID</label>
        <div className="flex items-center gap-2 bg-surface border border-card-border rounded-xl px-4 py-3">
          <span className="text-xs text-gray-500 font-mono flex-1 truncate">{user?.id ?? "—"}</span>
          <button onClick={copyUid} title="Copy UID" className="text-ink-soft/60 hover:text-brand transition-colors cursor-pointer">
            {uidCopied ? <IcCheck /> : <IcCopy />}
          </button>
        </div>
      </Card>

      {/* Nickname + Phone + Email */}
      <Card padding="md" className="space-y-4">
        <form onSubmit={handleSaveName} className="space-y-4">
          <div>
            <label className={labelCls}>Nickname</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" maxLength={60} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Phone Number</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" className={inputCls} />
          </div>
          <Button type="submit" disabled={savingName}>
            {savingName ? <><IcSpinner /> Saving…</> : "Save Changes"}
          </Button>
        </form>
      </Card>

      {/* Gender */}
      <Card padding="md">
        <label className={labelCls}>Gender</label>
        <div className="flex items-center gap-5 mt-2">
          {GENDERS.map((g) => (
            <label key={g.value} className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
              <input type="radio" name="gender" checked={gender === g.value} onChange={() => saveChoice("gender", g.value)} disabled={savingChoice === "gender"} className="accent-brand" />
              {g.label}
            </label>
          ))}
        </div>
      </Card>

      {/* Intended use */}
      <Card padding="md">
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
      </Card>

      {/* Onboarding */}
      <Card padding="md">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-ink">Restart onboarding tour</p>
            <p className="text-xs text-gray-400 mt-0.5">Replay the welcome screen and guided tour next time you visit the dashboard.</p>
          </div>
          <Button variant="secondary" onClick={handleRestartOnboarding} disabled={restarting}>
            {restarting ? <><IcSpinner /> Restarting…</> : "Restart Tour"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
