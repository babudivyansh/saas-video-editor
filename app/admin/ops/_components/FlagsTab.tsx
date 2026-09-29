"use client";

// Maintenance mode, feature flags, and the platform-wide session revoke.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { Switch } from "@/app/components/ui/Switch";
import { useToast } from "@/app/components/ui/Toast";
import { postJson, type Headers, type OpsData } from "./types";

export function FlagsTab({ data, headers }: { data: OpsData; headers: Headers }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [maintMessage, setMaintMessage] = useState(data.maintenance.message ?? "");
  const [newFlag, setNewFlag] = useState("");
  const [confirmMaint, setConfirmMaint] = useState<"on" | "off" | null>(null);
  const [deleteFlag, setDeleteFlag] = useState<string | null>(null);
  const [revokeAll, setRevokeAll] = useState(false);

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/admin/ops", { method: "PATCH", headers: headers(), body: JSON.stringify(body) });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.issues?.[0]?.message ?? e.error ?? "Update failed");
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-ops"] }),
    onError: (e: Error) => showToast(e.message, "error"),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card shadow padding="md">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-sm font-bold text-fg">Maintenance mode</h2>
          <StatusBadge tone={data.maintenance.on ? "warning" : "success"}>{data.maintenance.on ? "ON" : "Off"}</StatusBadge>
        </div>
        <p className="text-xs text-fg-subtle mb-3">Blocks all non-admin API calls with a 503 + your message. Admin routes and /api/health stay reachable.</p>
        <label htmlFor="maint-msg" className="block text-xs font-semibold text-fg-muted mb-1">Message shown to users (optional)</label>
        <input
          id="maint-msg"
          value={maintMessage}
          onChange={(e) => setMaintMessage(e.target.value)}
          maxLength={300}
          className="w-full text-sm bg-surface-2 border border-line rounded-lg px-3 py-2 mb-3 text-fg"
        />
        {data.maintenance.on ? (
          <Button variant="primary" size="sm" onClick={() => setConfirmMaint("off")}>Turn OFF maintenance</Button>
        ) : (
          <Button variant="danger" size="sm" onClick={() => setConfirmMaint("on")}>Turn ON maintenance</Button>
        )}
      </Card>

      <Card shadow padding="md">
        <h2 className="text-sm font-bold text-fg mb-2">Sessions</h2>
        <p className="text-xs text-fg-subtle mb-3">Incident response: log every non-admin user out immediately. They all have to sign in again.</p>
        <Button variant="danger" size="sm" onClick={() => setRevokeAll(true)}>Revoke all user sessions</Button>
      </Card>

      <Card shadow padding="md" className="lg:col-span-2">
        <h2 className="text-sm font-bold text-fg mb-1">Feature flags</h2>
        <p className="text-xs text-fg-subtle mb-3">
          Config-backed booleans readable anywhere via <code className="font-mono">isFeatureEnabled(&quot;name&quot;)</code>.
        </p>
        <ul className="divide-y divide-line">
          {Object.entries(data.flags).map(([name, value]) => (
            <li key={name} className="flex items-center gap-3 py-2">
              <code className="font-mono text-xs text-fg flex-1 break-all">{name}</code>
              <Switch
                checked={value}
                onChange={(v: boolean) => patch.mutate({ flag: { name, value: v } })}
                label={`${name} ${value ? "on" : "off"}`}
              />
              <Button variant="link" className="text-error text-xs" onClick={() => setDeleteFlag(name)}>Delete</Button>
            </li>
          ))}
          {Object.keys(data.flags).length === 0 && <li className="text-xs text-fg-subtle py-2">No flags defined.</li>}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newFlag.trim()) {
              patch.mutate({ flag: { name: newFlag.trim(), value: false } });
              setNewFlag("");
            }
          }}
          className="flex gap-2 mt-3"
        >
          <label htmlFor="new-flag" className="sr-only">New flag name</label>
          <input
            id="new-flag"
            value={newFlag}
            onChange={(e) => setNewFlag(e.target.value)}
            placeholder="new_flag_name"
            pattern="[\w.\-]{1,64}"
            className="flex-1 min-w-0 text-xs font-mono bg-surface-2 border border-line rounded-lg px-3 py-2 text-fg"
          />
          <Button type="submit" variant="primary" size="sm">Add flag</Button>
        </form>
      </Card>

      <ConfirmDialog
        open={confirmMaint === "on"}
        title="Turn ON maintenance"
        message="Block all non-admin API traffic with a 503 immediately? Admin routes and /api/health stay reachable."
        confirmLabel="Turn on"
        danger
        confirmPhrase="MAINTENANCE"
        onConfirm={async () => {
          await patch.mutateAsync({ maintenance: { on: true, message: maintMessage.trim() || undefined, confirm: true } }).catch(() => {});
        }}
        onClose={() => setConfirmMaint(null)}
      />
      <ConfirmDialog
        open={confirmMaint === "off"}
        title="Turn OFF maintenance"
        message="Restore normal traffic immediately?"
        confirmLabel="Turn off"
        onConfirm={async () => {
          await patch.mutateAsync({ maintenance: { on: false, confirm: true } }).catch(() => {});
        }}
        onClose={() => setConfirmMaint(null)}
      />
      <ConfirmDialog
        open={!!deleteFlag}
        title="Delete feature flag"
        message={`Delete “${deleteFlag ?? ""}”? Code reading it falls back to off.`}
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (deleteFlag) await patch.mutateAsync({ flag: { name: deleteFlag, value: null } }).catch(() => {});
        }}
        onClose={() => setDeleteFlag(null)}
      />
      <ConfirmDialog
        open={revokeAll}
        title="Revoke all user sessions"
        message="Log every non-admin user out immediately?"
        confirmLabel="Revoke all"
        danger
        confirmPhrase="LOGOUT ALL"
        onConfirm={async () => {
          try {
            await postJson("/api/admin/ops/sessions", headers, { confirm: true });
            showToast("All non-admin sessions revoked.", "success");
          } catch (e) {
            showToast((e as Error).message, "error");
          }
        }}
        onClose={() => setRevokeAll(false)}
      />
    </div>
  );
}
