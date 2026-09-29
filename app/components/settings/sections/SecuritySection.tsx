"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/app/components/AuthContext";
import { useToast } from "@/app/components/ui/Toast";
import { Card } from "@/app/components/ui/Card";
import { Button } from "@/app/components/ui/Button";
import { Modal } from "@/app/components/ui/Modal";
import { StepUpField, stepUpBody } from "@/app/components/settings/StepUpField";
import { PasswordInput } from "@/app/components/ui/PasswordInput";

function IcSpinner() { return <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />; }
function IcCheck() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M5 13l4 4L19 7" /></svg>; }
function IcCopy() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>; }

const inputCls = "w-full bg-panel border border-card-border rounded-xl px-4 py-3 text-sm text-ink placeholder:text-fg-subtle outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/25 transition-all"; // same as ui/Field
const labelCls = "text-xs font-semibold text-ink-soft uppercase tracking-wide block mb-1.5";

interface TwoFaStatus { enabled: boolean; unusedRecoveryCodes: number }

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${ok ? "bg-tint-emerald text-success" : "bg-warning/15 text-warning"}`}>
      {children}
    </span>
  );
}

function EmailSection() {
  const { user, token, refreshUser } = useAuth();
  const { showToast } = useToast();
  const t = useTranslations("SettingsSecurity.email");
  const tCode = useTranslations("SettingsSecurity.verifyCode");
  const [sendingVerify, setSendingVerify] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const [confirmingCode, setConfirmingCode] = useState(false);
  const [changing, setChanging] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  async function sendVerification() {
    setSendingVerify(true);
    try {
      const res = await fetch("/api/auth/verify-email/send", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? t("toasts.sendFailed"), "error"); return; }
      if (data.alreadyVerified) { showToast(t("toasts.alreadyVerified")); await refreshUser(); return; }
      setCodeSent(true);
      showToast(data.devCode ? `${t("toasts.verificationSent")} (dev: ${data.devCode})` : t("toasts.verificationSent"));
    } finally {
      setSendingVerify(false);
    }
  }

  async function confirmVerification(e: React.FormEvent) {
    e.preventDefault();
    setConfirmingCode(true);
    try {
      const res = await fetch("/api/auth/verify-email/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ otp: verifyCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error ?? tCode("failed"), "error"); return; }
      showToast(tCode("verified"));
      setCodeSent(false); setVerifyCode("");
      await refreshUser();
    } finally {
      setConfirmingCode(false);
    }
  }

  async function submitChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newEmail, ...stepUpBody(user?.hasPassword, password) }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? t("toasts.changeFailed"), "error"); return; }
      setPendingEmail(data.pendingEmail);
      setChanging(false);
      setPassword("");
      showToast(t("toasts.confirmationSentTo", { email: data.pendingEmail }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card padding="md" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-extrabold text-ink">{t("title")}</h3>
        <Badge ok={!!user?.emailVerifiedAt}>{user?.emailVerifiedAt ? t("verified") : t("unverified")}</Badge>
      </div>
      <div>
        <p className={labelCls}>{t("emailAddress")}</p>
        <div className="flex items-center gap-2 bg-surface border border-card-border rounded-xl px-4 py-3">
          <span className="text-sm text-fg flex-1 truncate">{user?.email ?? "—"}</span>
        </div>
        {pendingEmail && (
          <p className="text-xs text-warning mt-2">
            {t.rich("pendingConfirmation", { email: pendingEmail, strong: (chunks) => <strong>{chunks}</strong> })}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {!user?.emailVerifiedAt && (
          <Button variant="secondary" size="sm" onClick={sendVerification} disabled={sendingVerify}>
            {sendingVerify ? <><IcSpinner /> {t("sending")}</> : t("sendVerification")}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => setChanging((c) => !c)}>{changing ? t("cancel") : t("changeEmail")}</Button>
      </div>

      {codeSent && !user?.emailVerifiedAt && (
        <form onSubmit={confirmVerification} className="space-y-3 pt-2 border-t border-card-border">
          <p className="text-sm text-ink-soft">{tCode("prompt", { email: user?.email ?? "" })}</p>
          <div className="flex gap-2">
            <input type="text" required autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="d{6}" maxLength={6} value={verifyCode} onChange={(e) => setVerifyCode(e.target.value.replace(/D/g, ""))} placeholder="000000" className={`${inputCls} font-mono tracking-widest`} />
            <Button type="submit" size="sm" disabled={confirmingCode || verifyCode.length !== 6}>{confirmingCode ? <><IcSpinner /> {tCode("verifying")}</> : tCode("verify")}</Button>
          </div>
        </form>
      )}

      {changing && (
        <form onSubmit={submitChangeEmail} className="space-y-3 pt-2 border-t border-card-border">
          <div>
            <label htmlFor="settings-new-email" className={labelCls}>{t("newEmailAddress")}</label>
            <input id="settings-new-email" type="email" required autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="you@example.com" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t("confirmItsYou")}</label>
            <StepUpField value={password} onChange={setPassword} />
          </div>
          <Button type="submit" size="sm" disabled={submitting}>{submitting ? <><IcSpinner /> {t("sending")}</> : t("sendConfirmation")}</Button>
        </form>
      )}
    </Card>
  );
}

function PasswordSection() {
  const { user, token } = useAuth();
  const { showToast } = useToast();
  const t = useTranslations("SettingsSecurity.password");
  const [open, setOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) { showToast(t("toasts.mismatch"), "error"); return; }
    if (newPw.length < 8) { showToast(t("toasts.tooShort"), "error"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(t("toasts.updated"));
        setCurrentPw(""); setNewPw(""); setConfirmPw(""); setOpen(false);
      } else {
        showToast(data.error ?? t("toasts.updateFailed"), "error");
      }
    } finally {
      setLoading(false);
    }
  }

  const fields = [
    { id: "settings-current-password", autoComplete: "current-password" as const, label: t("currentPassword"), value: currentPw, setter: setCurrentPw, placeholder: t("currentPasswordPlaceholder") },
    { id: "settings-new-password", autoComplete: "new-password" as const, label: t("newPassword"), value: newPw, setter: setNewPw, placeholder: t("newPasswordPlaceholder") },
    { id: "settings-confirm-password", autoComplete: "new-password" as const, label: t("confirmNewPassword"), value: confirmPw, setter: setConfirmPw, placeholder: t("confirmNewPasswordPlaceholder") },
  ];

  return (
    <Card padding="md">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-extrabold text-ink">{t("title")}</h3>
        {user?.hasPassword !== false && (
          <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)}>{open ? t("cancel") : t("changePassword")}</Button>
        )}
      </div>
      {user?.hasPassword === false ? (
        <p className="mt-3 text-sm text-ink-soft">{t("noPassword")}</p>
      ) : !open ? (
        <p className="mt-3 text-sm tracking-widest text-fg-subtle">••••••••</p>
      ) : (
        <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
          {fields.map((f) => (
            <div key={f.label}>
              <label htmlFor={f.id} className={labelCls}>{f.label}</label>
              <PasswordInput id={f.id} autoComplete={f.autoComplete} value={f.value} onChange={(e) => f.setter(e.target.value)} placeholder={f.placeholder} required />
            </div>
          ))}
          <Button type="submit" disabled={loading}>{loading ? <><IcSpinner /> {t("updating")}</> : t("updatePassword")}</Button>
        </form>
      )}
    </Card>
  );
}

function TwoFactorSection() {
  const { user, token } = useAuth();
  const { showToast } = useToast();
  const t = useTranslations("SettingsSecurity.twoFactor");
  const tCommon = useTranslations("Common");
  const [status, setStatus] = useState<TwoFaStatus | null>(null);

  const [setupOpen, setSetupOpen] = useState(false);
  const [setupStep, setSetupStep] = useState<"password" | "scan" | "codes">("password");
  const [setupPassword, setSetupPassword] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");

  const [regenOpen, setRegenOpen] = useState(false);
  const [regenPassword, setRegenPassword] = useState("");
  // The codes view is shared with enrollment; this keeps the modal from
  // claiming you're "setting up" 2FA when you're only rotating codes.
  const [codesFromRegen, setCodesFromRegen] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/auth/2fa/status", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setStatus(await res.json());
  }, [token]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  function resetSetup() {
    setSetupOpen(false); setSetupStep("password"); setSetupPassword("");
    setQrDataUrl(null); setSecret(null); setCode(""); setRecoveryCodes([]);
    setCodesFromRegen(false);
  }

  async function startSetup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/auth/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(stepUpBody(user?.hasPassword, setupPassword)),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? t("toasts.setupFailed"), "error"); return; }
      setQrDataUrl(data.qrDataUrl); setSecret(data.secret); setSetupStep("scan");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/auth/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? t("toasts.invalidCode"), "error"); return; }
      setRecoveryCodes(data.recoveryCodes); setSetupStep("codes");
      await loadStatus();
    } finally {
      setBusy(false);
    }
  }

  async function disable2fa(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(stepUpBody(user?.hasPassword, disablePassword)),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? t("toasts.disableFailed"), "error"); return; }
      showToast(t("toasts.disabled2fa"));
      setDisableOpen(false); setDisablePassword("");
      await loadStatus();
    } finally {
      setBusy(false);
    }
  }

  // Reuses the setup modal's final "here are your codes" view rather than
  // building a second one — the only difference is how the codes were minted.
  async function regenerateRecoveryCodes(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/auth/2fa/recovery-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(stepUpBody(user?.hasPassword, regenPassword)),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? t("toasts.regenerateFailed"), "error"); return; }
      setRegenOpen(false);
      setRegenPassword("");
      setRecoveryCodes(data.recoveryCodes);
      setCodesFromRegen(true);
      setSetupStep("codes");
      setSetupOpen(true);
      await loadStatus();
    } finally {
      setBusy(false);
    }
  }

  function copyRecoveryCodes() {
    navigator.clipboard.writeText(recoveryCodes.join("\n"));
    showToast(t("toasts.codesCopied"));
  }

  return (
    <Card padding="md">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-extrabold text-ink">{t("title")}</h3>
        {status && <Badge ok={status.enabled}>{status.enabled ? t("enabled") : t("disabled")}</Badge>}
      </div>
      <p className="text-sm text-ink-soft mt-2">
        {status?.enabled
          ? t("enabledDesc", { count: status.unusedRecoveryCodes })
          : t("disabledDesc")}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {status?.enabled ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => setRegenOpen(true)}>{t("regenerateCodes")}</Button>
            <Button variant="secondary" size="sm" onClick={() => setDisableOpen(true)} className="!text-error">{t("disable2fa")}</Button>
          </>
        ) : (
          <Button size="sm" onClick={() => setSetupOpen(true)}>{t("enable2fa")}</Button>
        )}
      </div>

      <Modal open={setupOpen} onClose={resetSetup} title={codesFromRegen ? t("regenerateTitle") : t("setupTitle")} maxWidth="max-w-md">
        {setupStep === "password" && (
          <form onSubmit={startSetup} className="space-y-4">
            <p className="text-sm text-ink-soft">{t("confirmPasswordToStart")}</p>
            <StepUpField autoFocus value={setupPassword} onChange={setSetupPassword} placeholder={t("currentPasswordPlaceholder")} />
            <Button type="submit" disabled={busy} className="w-full">{busy ? <><IcSpinner /> {t("continuing")}</> : t("continue")}</Button>
          </form>
        )}
        {setupStep === "scan" && qrDataUrl && (
          <form onSubmit={confirmSetup} className="space-y-4">
            <p className="text-sm text-ink-soft">{t("scanInstructions")}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="2FA QR code" className="mx-auto w-48 h-48 rounded-xl border border-card-border" />
            <div className="bg-surface border border-card-border rounded-xl px-4 py-2.5 text-center">
              <code className="text-xs font-mono text-ink break-all">{secret}</code>
            </div>
            <div>
              <label htmlFor="settings-2fa-code" className={labelCls}>{t("sixDigitCode")}</label>
              <input id="settings-2fa-code" autoComplete="one-time-code" type="text" required autoFocus inputMode="numeric" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" className={`${inputCls} text-center text-lg tracking-[0.5em] font-mono`} />
            </div>
            <Button type="submit" disabled={busy || code.length !== 6} className="w-full">{busy ? <><IcSpinner /> {t("verifying")}</> : t("verifyAndEnable")}</Button>
          </form>
        )}
        {setupStep === "codes" && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-ink">{t("saveRecoveryCodes")}</p>
            <p className="text-xs text-ink-soft">{t("recoveryCodesHelp")}</p>
            <div className="bg-surface border border-card-border rounded-xl p-4 grid grid-cols-2 gap-2 font-mono text-xs text-ink">
              {recoveryCodes.map((c) => <span key={c}>{c}</span>)}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={copyRecoveryCodes}><IcCopy /> {t("copyAll")}</Button>
              <Button size="sm" onClick={resetSetup}><IcCheck /> {t("done")}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={regenOpen} onClose={() => setRegenOpen(false)} title={t("regenerateTitle")} maxWidth="max-w-sm">
        <form onSubmit={regenerateRecoveryCodes} className="space-y-4">
          <p className="text-sm text-ink-soft">{t("regenerateConfirm")}</p>
          <StepUpField autoFocus value={regenPassword} onChange={setRegenPassword} placeholder={t("currentPasswordPlaceholder")} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setRegenOpen(false)}>{tCommon("cancel")}</Button>
            <Button type="submit" size="sm" disabled={busy}>{busy ? <><IcSpinner /> {t("generating")}</> : t("regenerate")}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={disableOpen} onClose={() => setDisableOpen(false)} title={t("disableTitle")} maxWidth="max-w-sm">
        <form onSubmit={disable2fa} className="space-y-4">
          <p className="text-sm text-ink-soft">{t("disableConfirm")}</p>
          <StepUpField autoFocus value={disablePassword} onChange={setDisablePassword} placeholder={t("currentPasswordPlaceholder")} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setDisableOpen(false)}>{tCommon("cancel")}</Button>
            <Button type="submit" size="sm" disabled={busy} className="!bg-none !bg-error !text-bg !shadow-none hover:!brightness-110">{busy ? <><IcSpinner /> {t("disabling")}</> : t("disable")}</Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

export default function SecuritySettingsPage() {
  const t = useTranslations("SettingsSecurity");
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-extrabold grad-text inline-block">{t("pageTitle")}</h2>
        <p className="text-sm text-ink-soft mt-1">{t("pageSubtitle")}</p>
      </div>
      <EmailSection />
      <PasswordSection />
      <TwoFactorSection />
    </div>
  );
}
