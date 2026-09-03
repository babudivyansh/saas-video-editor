"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/app/components/AuthContext";
import { useToast } from "@/app/components/ui/Toast";
import { Card } from "@/app/components/ui/Card";
import { Button } from "@/app/components/ui/Button";
import { AssetField } from "@/app/components/assets/AssetField";
import type { PickerAsset } from "@/app/components/assets/assetPickerData";

function IcCamera() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>; }
function IcCopy() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>; }
function IcCheck() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M5 13l4 4L19 7" /></svg>; }
function IcSpinner() { return <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />; }

const inputCls = "w-full bg-panel border border-card-border rounded-xl px-4 py-3 text-sm text-ink placeholder:text-ink-soft/50 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all";
const labelCls = "text-xs font-semibold text-ink-soft uppercase tracking-wide block mb-1.5";

export default function ProfileSettingsPage() {
  const { user, token, refreshUser } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const t = useTranslations("SettingsProfile");

  const GENDERS = [
    { value: "male", label: t("genders.male") },
    { value: "female", label: t("genders.female") },
    { value: "unspecified", label: t("genders.unspecified") },
  ];

  const INTENDED_USES = [
    { value: "content_creator", label: t("intendedUses.contentCreator") },
    { value: "business_marketing", label: t("intendedUses.businessMarketing") },
    { value: "personal", label: t("intendedUses.personal") },
    { value: "other", label: t("intendedUses.other") },
  ];

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
      if (res.ok) { showToast(t("toasts.profileUpdated")); await refreshUser(); }
      else showToast(data.error ?? t("toasts.profileUpdateFailed"), "error");
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
        showToast(t("toasts.saveFailed"), "error");
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
    if (!file.type.startsWith("image/")) { showToast(t("toasts.chooseImageFile"), "error"); return; }
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const up = await fetch("/api/upload?skipAsset=true", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const upData = (await up.json()) as { url?: string; error?: string };
      if (!up.ok || !upData.url) throw new Error(upData.error ?? t("toasts.uploadFailed"));
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ avatarUrl: upData.url }),
      });
      if (!res.ok) throw new Error(t("toasts.avatarSaveFailed"));
      await refreshUser();
      showToast(t("toasts.avatarUpdated"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("toasts.avatarUploadFailed"), "error");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleAvatarAssetSelected(asset: PickerAsset) {
    setUploadingAvatar(true);
    try {
      // The server resolves this to the asset's permanent public URL and
      // verifies ownership — never trust/store the picker's short-lived
      // signed read URL as a persistent avatarUrl.
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ avatarAssetId: asset.id }),
      });
      if (!res.ok) throw new Error(t("toasts.avatarSaveFailed"));
      await refreshUser();
      showToast(t("toasts.avatarUpdated"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("toasts.avatarUploadFailed"), "error");
    } finally {
      setUploadingAvatar(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-extrabold grad-text inline-block">{t("pageTitle")}</h1>
        <p className="text-sm text-ink-soft mt-1">{t("pageSubtitle")}</p>
      </div>

      {/* Avatar */}
      <Card padding="md" className="flex items-center gap-4">
        <div className="relative flex-shrink-0">
          {user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="avatar" className="w-16 h-16 rounded-full object-cover shadow-sm" />
          ) : (
            <div className="w-16 h-16 rounded-full grad-brand flex items-center justify-center text-on-primary text-2xl font-extrabold">
              {(user?.name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
            </div>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            title={t("changeAvatar")}
            className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-panel shadow border border-card-border flex items-center justify-center text-ink-soft hover:text-brand transition-colors cursor-pointer"
          >
            {uploadingAvatar ? <div className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" /> : <IcCamera />}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>
        <div>
          <p className="text-sm font-bold text-ink">{user?.name || t("profilePhotoFallback")}</p>
          <p className="text-xs text-ink-soft mt-0.5">{t("avatarHelp")}</p>
          <div className="mt-2">
            <AssetField accept={["image"]} label="Choose from Assets" onSelect={handleAvatarAssetSelected} />
          </div>
        </div>
      </Card>

      {/* UID */}
      <Card padding="md">
        <label className={labelCls}>{t("uid")}</label>
        <div className="flex items-center gap-2 bg-surface border border-card-border rounded-xl px-4 py-3">
          <span className="text-xs text-fg-muted font-mono flex-1 truncate">{user?.id ?? "—"}</span>
          <button onClick={copyUid} title={t("copyUid")} className="text-ink-soft/60 hover:text-brand transition-colors cursor-pointer">
            {uidCopied ? <IcCheck /> : <IcCopy />}
          </button>
        </div>
      </Card>

      {/* Nickname + Phone + Email */}
      <Card padding="md" className="space-y-4">
        <form onSubmit={handleSaveName} className="space-y-4">
          <div>
            <label className={labelCls}>{t("nickname")}</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t("nicknamePlaceholder")} maxLength={60} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t("phoneNumber")}</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" className={inputCls} />
          </div>
          <Button type="submit" disabled={savingName}>
            {savingName ? <><IcSpinner /> {t("saving")}</> : t("saveChanges")}
          </Button>
        </form>
      </Card>

      {/* Gender */}
      <Card padding="md">
        <label className={labelCls}>{t("gender")}</label>
        <div className="flex items-center gap-5 mt-2">
          {GENDERS.map((g) => (
            <label key={g.value} className="flex items-center gap-2 text-sm text-fg cursor-pointer">
              <input type="radio" name="gender" checked={gender === g.value} onChange={() => saveChoice("gender", g.value)} disabled={savingChoice === "gender"} className="accent-brand" />
              {g.label}
            </label>
          ))}
        </div>
      </Card>

      {/* Intended use */}
      <Card padding="md">
        <label className={labelCls}>{t("intendedUseLabel")}</label>
        <div className="flex flex-wrap gap-2 mt-2">
          {INTENDED_USES.map((o) => (
            <button
              key={o.value}
              onClick={() => saveChoice("intendedUse", o.value)}
              disabled={savingChoice === "intendedUse"}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                intendedUse === o.value ? "grad-brand text-on-primary shadow-glow" : "bg-panel border border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink"
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
            <p className="text-sm font-semibold text-ink">{t("restartTourTitle")}</p>
            <p className="text-xs text-fg-subtle mt-0.5">{t("restartTourDesc")}</p>
          </div>
          <Button variant="secondary" onClick={handleRestartOnboarding} disabled={restarting}>
            {restarting ? <><IcSpinner /> {t("restarting")}</> : t("restartTour")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
