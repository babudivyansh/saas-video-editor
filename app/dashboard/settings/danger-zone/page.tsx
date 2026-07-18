"use client";

import { useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useToast } from "@/app/components/ui/Toast";
import { Card } from "@/app/components/ui/Card";
import { Button } from "@/app/components/ui/Button";
import { Modal } from "@/app/components/ui/Modal";

const inputCls = "w-full bg-white border border-card-border rounded-xl px-4 py-3 text-sm text-ink placeholder:text-ink-soft/50 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all";
function IcSpinner() { return <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />; }

function DangerRow({ title, desc, actionLabel, onAction, actionVariant = "outline" }: {
  title: string; desc: string; actionLabel: string; onAction: () => void; actionVariant?: "outline" | "solid";
}) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-4 border-t border-red-50 first:border-t-0 first:pt-0">
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
      </div>
      <button
        onClick={onAction}
        className={`flex-shrink-0 text-sm font-semibold px-5 py-2 rounded-xl transition-colors cursor-pointer ${
          actionVariant === "solid" ? "text-white bg-red-600 hover:bg-red-700" : "text-red-600 border border-red-200 hover:bg-red-50"
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

  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivatePw, setDeactivatePw] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (!res.ok) { setError(data.error ?? "Failed to deactivate"); return; }
      showToast("Account deactivated");
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
      if (!res.ok) { setError(data.error ?? "Failed to delete account"); return; }
      signOut();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-extrabold grad-text inline-block">Danger Zone</h1>
        <p className="text-sm text-ink-soft mt-1">Irreversible and destructive actions.</p>
      </div>

      <Card padding="md" className="border-red-100">
        <DangerRow
          title="Sign out"
          desc="Sign out of this device."
          actionLabel="Sign Out"
          onAction={signOut}
        />
        <DangerRow
          title="Deactivate account"
          desc="Temporarily disable your account. You have 30 days to sign back in and reactivate before it's permanently deleted."
          actionLabel="Deactivate"
          onAction={() => setDeactivateOpen(true)}
        />
        <DangerRow
          title="Delete account"
          desc="Permanently deletes your account, videos, and data. This cannot be undone."
          actionLabel="Delete Account"
          actionVariant="solid"
          onAction={() => setDeleteOpen(true)}
        />
      </Card>

      <Modal open={deactivateOpen} onClose={() => { setDeactivateOpen(false); setError(null); setDeactivatePw(""); }} title="Deactivate your account?" maxWidth="max-w-sm">
        <form onSubmit={handleDeactivate} className="space-y-4">
          <p className="text-sm text-ink-soft">You&apos;ll be signed out everywhere. Sign back in within 30 days to reactivate — after that, your account is permanently deleted.</p>
          <input type="password" required autoFocus value={deactivatePw} onChange={(e) => setDeactivatePw(e.target.value)} placeholder="Confirm your password" className={inputCls} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setDeactivateOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy} className="!bg-none !bg-red-600">{busy ? <><IcSpinner /> Deactivating…</> : "Deactivate"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={deleteOpen} onClose={() => { setDeleteOpen(false); setError(null); setDeletePw(""); }} title="Permanently delete your account?" maxWidth="max-w-sm">
        <form onSubmit={handleDelete} className="space-y-4">
          <p className="text-sm text-ink-soft">This permanently deletes your account, videos, and data. This cannot be undone.</p>
          <input type="password" required autoFocus value={deletePw} onChange={(e) => setDeletePw(e.target.value)} placeholder="Confirm your password" className={inputCls} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy} className="!bg-none !bg-red-600">{busy ? <><IcSpinner /> Deleting…</> : "Permanently Delete"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
