"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useAuth } from "@/app/components/AuthContext";
import { AssetField } from "@/app/components/assets/AssetField";
import type { PickerAsset } from "@/app/components/assets/assetPickerData";

// Self-contained account settings (avatar, profile, password, sign-out). Single
// source of truth used by both the sidebar Settings modal and the Profile page's
// Account Settings tab. Reuses the existing endpoints — no new APIs.
function IcUser()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>; }
function IcLock()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>; }
function IcCamera()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>; }
function IcSpinner() { return <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />; }

export default function AccountSettings() {
  const { user, token, signOut, refreshUser } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone]             = useState("");
  const [savingName, setSavingName]   = useState(false);
  const [nameMsg, setNameMsg]         = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw]         = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg]         = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => { setDisplayName(user?.name ?? ""); }, [user?.name]);
  useEffect(() => { setPhone(user?.phone ?? ""); }, [user?.phone]);

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
      if (res.ok) { setNameMsg({ type: "success", text: "Profile updated." }); await refreshUser(); }
      else setNameMsg({ type: "error", text: data.error ?? "Failed to update profile." });
    } finally {
      setSavingName(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setNameMsg({ type: "error", text: "Please choose an image file." }); return; }
    setUploadingAvatar(true);
    setNameMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const up = await fetch("/api/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
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

  async function handleAvatarAssetSelected(asset: PickerAsset) {
    setUploadingAvatar(true);
    setNameMsg(null);
    try {
      // The server resolves this to the asset's permanent public URL and
      // verifies ownership — never trust/store the picker's short-lived
      // signed read URL as a persistent avatarUrl.
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ avatarAssetId: asset.id }),
      });
      if (!res.ok) throw new Error("Failed to save avatar");
      setNameMsg({ type: "success", text: "Avatar updated." });
      await refreshUser();
    } catch (err) {
      setNameMsg({ type: "error", text: err instanceof Error ? err.message : "Avatar upload failed." });
    } finally {
      setUploadingAvatar(false);
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
      if (res.ok) { setPwMsg({ type: "success", text: "Password updated successfully." }); setCurrentPw(""); setNewPw(""); setConfirmPw(""); }
      else setPwMsg({ type: "error", text: data.error ?? "Failed to update password." });
    } finally {
      setPwLoading(false);
    }
  }

  const inputCls = "w-full bg-surface-2 border border-line rounded-xl px-4 py-3 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-transparent transition-all";
  const labelCls = "text-xs font-semibold text-fg-muted uppercase tracking-wide block mb-1.5";

  return (
    <div className="space-y-6">
      {/* Avatar + identity */}
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0">
          {user?.avatarUrl ? (
            <Image
              src={user.avatarUrl}
              alt="avatar"
              width={64}
              height={64}
              className="w-16 h-16 rounded-2xl object-cover shadow-sm"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-brand flex items-center justify-center text-on-primary text-2xl font-extrabold select-none shadow-sm">
              {(user?.name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
            </div>
          )}
          <button onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar} title="Change avatar"
            className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-panel shadow border border-line flex items-center justify-center text-fg-muted hover:text-brand transition-colors">
            {uploadingAvatar ? <IcSpinner /> : <IcCamera />}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold text-fg truncate">{user?.name || user?.email || "—"}</p>
          <p className="text-sm text-fg-subtle truncate">{user?.email}</p>
          <div className="mt-1.5">
            <AssetField accept={["image"]} label="Choose from Assets" onSelect={handleAvatarAssetSelected} />
          </div>
        </div>
      </div>

      {/* Edit profile */}
      <div className="rounded-2xl border border-line p-5 space-y-4">
        <div className="flex items-center gap-2"><IcUser /><h3 className="text-sm font-bold text-fg">Edit Profile</h3></div>
        <form onSubmit={handleSaveName} className="space-y-4">
          <div>
            <label className={labelCls}>Display Name</label>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" maxLength={60} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Phone Number</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Email Address</label>
            <div className="flex items-center gap-2 bg-surface-2 border border-line rounded-xl px-4 py-3">
              <span className="text-sm text-fg flex-1 truncate">{user?.email ?? "—"}</span>
              <span className="text-[10px] font-semibold text-fg-subtle bg-surface-3 px-2 py-0.5 rounded-full flex-shrink-0">Read only</span>
            </div>
          </div>
          {nameMsg && (
            <div className={`text-sm font-medium px-4 py-3 rounded-xl ${nameMsg.type === "success" ? "bg-green-50 text-green-700" : "bg-error/10 text-error"}`}>{nameMsg.text}</div>
          )}
          <button type="submit" disabled={savingName} className="w-full flex items-center justify-center gap-2 bg-brand hover:bg-brand-dark disabled:bg-brand/60 text-on-primary text-sm font-semibold py-3 rounded-xl transition-colors">
            {savingName ? <><IcSpinner /> Saving…</> : "Save Changes"}
          </button>
        </form>
      </div>

      {/* Change password */}
      <div className="rounded-2xl border border-line p-5">
        <div className="flex items-center gap-2 mb-4"><IcLock /><h3 className="text-sm font-bold text-fg">Change Password</h3></div>
        <form onSubmit={handleChangePassword} className="space-y-4">
          {[
            { label: "Current Password", value: currentPw, setter: setCurrentPw, placeholder: "Enter current password" },
            { label: "New Password", value: newPw, setter: setNewPw, placeholder: "At least 8 characters" },
            { label: "Confirm New Password", value: confirmPw, setter: setConfirmPw, placeholder: "Repeat new password" },
          ].map(f => (
            <div key={f.label}>
              <label className={labelCls}>{f.label}</label>
              <input type="password" value={f.value} onChange={e => f.setter(e.target.value)} placeholder={f.placeholder} required className={inputCls} />
            </div>
          ))}
          {pwMsg && (
            <div className={`text-sm font-medium px-4 py-3 rounded-xl ${pwMsg.type === "success" ? "bg-green-50 text-green-700" : "bg-error/10 text-error"}`}>{pwMsg.text}</div>
          )}
          <button type="submit" disabled={pwLoading} className="w-full flex items-center justify-center gap-2 bg-brand hover:bg-brand-dark disabled:bg-brand/60 text-on-primary text-sm font-semibold py-3 rounded-xl transition-colors">
            {pwLoading ? <><IcSpinner /> Updating…</> : "Update Password"}
          </button>
        </form>
      </div>

      {/* Danger zone */}
      <div className="rounded-2xl border border-error/30 p-5">
        <h3 className="text-sm font-bold text-error mb-3">Danger Zone</h3>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-fg">Sign out of all devices</p>
            <p className="text-xs text-fg-subtle mt-0.5">Invalidates your current session.</p>
          </div>
          <button onClick={signOut} className="flex-shrink-0 text-sm font-semibold text-error border border-error/40 hover:bg-error/10 px-5 py-2 rounded-xl transition-colors">
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
