"use client";

// Replaces the old disabled "Coming soon" pill in Settings → Preferences.
// Selecting a language PATCHes User.preferredLanguage (which also re-stamps
// the locale cookie server-side — see app/api/auth/profile/route.ts), then
// refreshes the router so the server-rendered dashboard subtree re-renders
// with the new locale's messages immediately.
//
// The dropdown panel is portaled to document.body (like Modal.tsx) rather
// than using the shared Dropdown primitive — Dropdown positions its panel
// with a plain absolute div, but this control sits inside a Card, and Card
// always sets overflow-hidden (to clip content to its rounded corners),
// which would clip the panel before it ever became visible.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/app/components/AuthContext";
import { useToast } from "@/app/components/ui/Toast";
import { SUPPORTED_LOCALES, type LocaleCode } from "@/lib/i18n-locales";

function IcChevron() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M6 9l6 6 6-6" /></svg>;
}
function IcCheck() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M5 13l4 4L19 7" /></svg>;
}

export function LanguageSwitcher() {
  const { token } = useAuth();
  const locale = useLocale() as LocaleCode;
  const router = useRouter();
  const { showToast } = useToast();
  const t = useTranslations("SettingsPreferences");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<LocaleCode | null>(null);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const current = SUPPORTED_LOCALES.find((l) => l.code === locale) ?? SUPPORTED_LOCALES[0];

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setOpen((o) => !o);
  }

  async function selectLocale(code: LocaleCode) {
    if (code === locale) { setOpen(false); return; }
    setSaving(code);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ preferredLanguage: code }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error ?? t("saveFailed"), "error");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggle}
        className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold text-ink bg-gray-50 border border-card-border rounded-full px-3 py-1.5 hover:bg-tint-blue transition-colors cursor-pointer"
      >
        {current.name}
        <IcChevron />
      </button>
      {open && position && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: position.top, right: position.right }}
          className="w-48 max-h-80 overflow-y-auto py-1.5 rounded-2xl border border-card-border bg-white shadow-xl z-[100]"
        >
          {SUPPORTED_LOCALES.map((l) => (
            <button
              key={l.code}
              onClick={() => selectLocale(l.code)}
              className="w-full flex items-center gap-2 text-left text-sm px-3.5 py-2.5 text-ink hover:bg-tint-blue transition-colors cursor-pointer"
            >
              <span className="flex-1">{l.name}</span>
              {saving === l.code ? (
                <div className="w-3.5 h-3.5 border-2 border-brand/40 border-t-brand rounded-full animate-spin" />
              ) : l.code === locale ? (
                <span className="text-brand"><IcCheck /></span>
              ) : null}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
