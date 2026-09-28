"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/app/components/AuthContext";
import { useToast } from "@/app/components/ui/Toast";

// The "confirm it's you" input on sensitive actions (change email, 2FA,
// deactivate/delete). Accounts with a password type it; accounts without one
// (Google signups — hasPassword false) get an emailed code instead, because
// they were never shown a password to type. The server side is
// lib/step-up.ts, which accepts `password` or `otp` accordingly.

const inputCls = "w-full bg-panel border border-card-border rounded-xl px-4 py-3 text-sm text-ink placeholder:text-ink-soft/50 outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all";

/** Request-body fragment for the step-up value, keyed the way the server expects. */
export function stepUpBody(hasPassword: boolean | undefined, value: string): { password: string } | { otp: string } {
  return hasPassword === false ? { otp: value } : { password: value };
}

export function StepUpField({
  value,
  onChange,
  autoFocus,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const { user, token } = useAuth();
  const { showToast } = useToast();
  const t = useTranslations("SettingsSecurity.stepUp");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (user?.hasPassword !== false) {
    return (
      <input
        type="password"
        required
        autoFocus={autoFocus}
        autoComplete="current-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t("passwordPlaceholder")}
        className={inputCls}
      />
    );
  }

  async function sendCode() {
    setSending(true);
    try {
      const res = await fetch("/api/auth/step-up/send", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error ?? t("sendFailed"), "error"); return; }
      setSent(true);
      showToast(data.devCode ? `${t("codeSent")} (dev: ${data.devCode})` : t("codeSent"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-soft">{t("codeHelp")}</p>
      <div className="flex gap-2">
        <input
          type="text"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          autoFocus={autoFocus && sent}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
          placeholder={t("codePlaceholder")}
          className={`${inputCls} font-mono tracking-widest`}
        />
        <button
          type="button"
          onClick={sendCode}
          disabled={sending}
          className="shrink-0 rounded-xl border border-card-border px-3 text-xs font-semibold text-fg hover:bg-surface-2 disabled:opacity-60"
        >
          {sending ? t("sending") : sent ? t("resendCode") : t("sendCode")}
        </button>
      </div>
    </div>
  );
}
