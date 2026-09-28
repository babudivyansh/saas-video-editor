"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/app/components/AuthContext";
import { useToast } from "@/app/components/ui/Toast";
import { Card } from "@/app/components/ui/Card";
import { Button } from "@/app/components/ui/Button";
import { Modal } from "@/app/components/ui/Modal";

const DELETE_CONFIRM_WORD = "DELETE";

const inputCls = "w-full bg-panel border border-card-border rounded-xl px-4 py-3 text-sm text-ink placeholder:text-ink-soft/50 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all";
function IcSpinner() { return <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />; }

function DangerRow({ title, desc, actionLabel, onAction, actionVariant = "outline" }: {
  title: string; desc: string; actionLabel: string; onAction: () => void; actionVariant?: "outline" | "solid";
}) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-4 border-t border-error/25 first:border-t-0 first:pt-0">
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-xs text-fg-subtle mt-0.5">{desc}</p>
      </div>
      <button
        onClick={onAction}
        className={`flex-shrink-0 text-sm font-semibold px-5 py-2 rounded-xl transition-colors cursor-pointer ${
          actionVariant === "solid" ? "text-white bg-error hover:bg-error/85" : "text-error border border-error/40 hover:bg-error/10"
        }`}
      >
        {actionLabel}
      </button>
    </div>
  );
}

export default function DangerZoneSettingsPage() {
  const { token, signOut } = useAuth();
  const { showToast } = useToast();
  const t = useTranslations("SettingsDangerZone");

  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivatePw, setDeactivatePw] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Checked once on mount so "Delete account" can route a paying customer to
  // an upfront explanation instead of letting them fill in a password just to
  // hit the server's 409 (billing history must be retained — see
  // lib/account-deletion.ts). null = not resolved yet; treated as "unknown",
  // never blocks the button, just skips the pre-check banner.
  const [hasPurchaseHistory, setHasPurchaseHistory] = useState<boolean | null>(null);
  const [blockedOpen, setBlockedOpen] = useState(false);
  // Type-to-confirm gate before the password field appears, in addition to
  // it — a second, harder-to-fat-finger barrier on the one action in this
  // page that can never be undone.
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteStage, setDeleteStage] = useState<"confirm" | "password">("confirm");
  const deleteConfirmed = deleteConfirmText.trim() === DELETE_CONFIRM_WORD;

  useEffect(() => {
    if (!token) return;
    fetch("/api/auth/purchases?limit=1", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : { purchases: [] }))
      .then((data) => setHasPurchaseHistory((data.purchases ?? []).length > 0))
      .catch(() => { /* unknown is fine — falls back to the normal flow */ });
  }, [token]);

  function openDeleteFlow() {
    if (hasPurchaseHistory) {
      setBlockedOpen(true);
      return;
    }
    setDeleteConfirmText("");
    setDeleteStage("confirm");
    setDeleteOpen(true);
  }

  async function handleDeactivate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/deactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: deactivatePw }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? t("errors.deactivateFailed")); return; }
      showToast(t("toasts.deactivated"));
      signOut();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: deletePw }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? t("errors.deleteFailed")); return; }
      signOut();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-extrabold grad-text inline-block">{t("pageTitle")}</h1>
        <p className="text-sm text-ink-soft mt-1">{t("pageSubtitle")}</p>
      </div>

      <Card padding="md" className="border-error/30">
        <DangerRow
          title={t("signOut.title")}
          desc={t("signOut.desc")}
          actionLabel={t("signOut.action")}
          onAction={signOut}
        />
        <DangerRow
          title={t("deactivate.title")}
          desc={t("deactivate.desc")}
          actionLabel={t("deactivate.action")}
          onAction={() => setDeactivateOpen(true)}
        />
        <DangerRow
          title={t("delete.title")}
          desc={t("delete.desc")}
          actionLabel={t("delete.action")}
          actionVariant="solid"
          onAction={openDeleteFlow}
        />
      </Card>

      <Modal open={deactivateOpen} onClose={() => { setDeactivateOpen(false); setError(null); setDeactivatePw(""); }} title={t("deactivateModal.title")} maxWidth="max-w-sm">
        <form onSubmit={handleDeactivate} className="space-y-4">
          <p className="text-sm text-ink-soft">{t("deactivateModal.body")}</p>
          <input type="password" required autoFocus value={deactivatePw} onChange={(e) => setDeactivatePw(e.target.value)} placeholder={t("confirmPasswordPlaceholder")} className={inputCls} />
          {error && <p className="text-sm text-error">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setDeactivateOpen(false)}>{t("cancel")}</Button>
            <Button type="submit" size="sm" disabled={busy} className="!bg-none !bg-error">{busy ? <><IcSpinner /> {t("deactivateModal.deactivating")}</> : t("deactivate.action")}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => { setDeleteOpen(false); setError(null); setDeletePw(""); setDeleteConfirmText(""); setDeleteStage("confirm"); }}
        onBack={deleteStage === "password" ? () => setDeleteStage("confirm") : undefined}
        title={t("deleteModal.title")}
        maxWidth="max-w-sm"
      >
        {deleteStage === "confirm" ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">{t("deleteModal.body")}</p>
            <div>
              <p className="text-sm text-ink-soft mb-2">
                {t("deleteModal.typeToConfirmPrefix")} <strong className="text-error">{DELETE_CONFIRM_WORD}</strong> {t("deleteModal.typeToConfirmSuffix")}
              </p>
              <input
                type="text"
                autoFocus
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={DELETE_CONFIRM_WORD}
                className={inputCls}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setDeleteOpen(false)}>{t("cancel")}</Button>
              <Button type="button" size="sm" disabled={!deleteConfirmed} className="!bg-none !bg-error" onClick={() => setDeleteStage("password")}>
                {t("deleteModal.continue")}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleDelete} className="space-y-4">
            <p className="text-sm text-ink-soft">{t("deleteModal.body")}</p>
            <input type="password" required autoFocus value={deletePw} onChange={(e) => setDeletePw(e.target.value)} placeholder={t("confirmPasswordPlaceholder")} className={inputCls} />
            {error && <p className="text-sm text-error">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setDeleteOpen(false)}>{t("cancel")}</Button>
              <Button type="submit" size="sm" disabled={busy} className="!bg-none !bg-error">{busy ? <><IcSpinner /> {t("deleteModal.deleting")}</> : t("deleteModal.permanentlyDelete")}</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Purchase-history pre-check: hardDeleteUserAccount refuses any account
          with a Purchase row (financial records are never silently destroyed —
          see lib/account-deletion.ts). Surfacing that BEFORE the password
          modal means a paying customer never fills in a password only to hit
          the 409 after the fact. */}
      <Modal open={blockedOpen} onClose={() => setBlockedOpen(false)} title={t("deleteBlockedModal.title")} maxWidth="max-w-sm">
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">{t("deleteBlockedModal.body")}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" onClick={() => setBlockedOpen(false)}>{t("deleteBlockedModal.gotIt")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
