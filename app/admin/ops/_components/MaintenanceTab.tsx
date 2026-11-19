"use client";

// Per-feature maintenance: switch one feature off for users without taking
// the site down. Users see "Under maintenance. Please check after some time."
// on its pages and its API refuses new work (503); admins keep using it.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/app/components/ui/Card";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { Switch } from "@/app/components/ui/Switch";
import { useToast } from "@/app/components/ui/Toast";
import type { Headers } from "./types";

export interface MaintenanceFeatureRow {
  id: string;
  label: string;
  group: string;
  groupLabel: string;
  pagePaths: string[];
  apiPaths: string[];
  on: boolean;
  since: string | null;
}

const QUERY_KEY = ["admin-feature-maintenance"];

export function MaintenanceTab({ headers }: { headers: Headers }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<MaintenanceFeatureRow | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/admin/ops/feature-maintenance", { headers: headers() });
      if (!res.ok) throw new Error("Failed to load maintenance switches");
      return (await res.json()) as { features: MaintenanceFeatureRow[] };
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ feature, on }: { feature: string; on: boolean }) => {
      const res = await fetch("/api/admin/ops/feature-maintenance", {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ feature, on }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.issues?.[0]?.message ?? body.error ?? "Update failed");
      return body as { features: MaintenanceFeatureRow[] };
    },
    onSuccess: (body, { feature, on }) => {
      queryClient.setQueryData(QUERY_KEY, body);
      const label = body.features.find((f) => f.id === feature)?.label ?? feature;
      showToast(on ? `${label} is now in maintenance.` : `${label} is back for users.`, "success");
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  if (isError) return <p className="text-sm text-error">Couldn’t load the maintenance switches.</p>;
  if (isLoading || !data) return <div className="h-64 bg-surface-3 rounded-2xl animate-pulse" />;

  const groups = new Map<string, MaintenanceFeatureRow[]>();
  for (const f of data.features) groups.set(f.groupLabel, [...(groups.get(f.groupLabel) ?? []), f]);
  const onCount = data.features.filter((f) => f.on).length;

  return (
    <div className="space-y-5">
      <Card shadow padding="md">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-sm font-bold text-fg">Feature maintenance</h2>
          <StatusBadge tone={onCount > 0 ? "warning" : "success"}>{onCount > 0 ? `${onCount} in maintenance` : "All live"}</StatusBadge>
        </div>
        <p className="text-xs text-fg-subtle">
          Switch one feature off for users. Its pages show “Under maintenance. Please check after some time.” and its API refuses
          new work with a 503, so nobody is charged. Viewing and downloading past results still works, and admins can keep using
          the feature to test. Takes effect within about 15 seconds.
        </p>
      </Card>

      {[...groups.entries()].map(([groupLabel, features]) => (
        <Card key={groupLabel} shadow padding="md">
          <h3 className="text-xs font-bold uppercase tracking-wide text-fg-muted mb-2">{groupLabel}</h3>
          <ul className="divide-y divide-line">
            {features.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-fg">{f.label}</span>
                    {f.on && <StatusBadge tone="warning">Maintenance</StatusBadge>}
                  </div>
                  <p className="text-xs text-fg-subtle truncate" title={[...f.pagePaths, ...f.apiPaths].join("  ·  ")}>
                    {f.pagePaths.join(", ")}
                    {f.on && f.since ? ` · since ${new Date(f.since).toLocaleString()}` : ""}
                  </p>
                </div>
                <Switch
                  checked={f.on}
                  disabled={toggle.isPending}
                  onChange={(on: boolean) => (on ? setConfirm(f) : toggle.mutate({ feature: f.id, on: false }))}
                  label={`${f.label} maintenance ${f.on ? "on" : "off"}`}
                />
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <ConfirmDialog
        open={!!confirm}
        title={`Put ${confirm?.label ?? ""} in maintenance`}
        message={`Users will see “Under maintenance. Please check after some time.” on ${confirm?.label ?? "this feature"} and can't start new work there until you switch it back. Admins can still use it.`}
        confirmLabel="Put in maintenance"
        danger
        onConfirm={async () => {
          if (confirm) await toggle.mutateAsync({ feature: confirm.id, on: true }).catch(() => {});
        }}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
