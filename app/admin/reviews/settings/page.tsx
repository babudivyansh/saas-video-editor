"use client";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import AdminShell from "../../AdminShell";
import { ErrorCard } from "../../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { useToast } from "@/app/components/ui/Toast";

interface ReviewSettings {
  minAccountAgeHours: number;
  requireProductUsage: boolean;
  spamScoreAutoHideThreshold: number;
  autoHideReportThreshold: number;
  promptThrottleDays: number;
  promptMaxLifetime: number;
  emailDrip1DelayHours: number;
  emailDrip2DelayDays: number;
  emailDrip3DelayDays: number;
}

const FIELDS: { key: keyof ReviewSettings; label: string; hint: string; type: "number" | "boolean" }[] = [
  { key: "requireProductUsage", label: "Require product usage", hint: "Reviewer must have rendered at least one video before reviewing.", type: "boolean" },
  { key: "minAccountAgeHours", label: "Minimum account age (hours)", hint: "0 disables this check.", type: "number" },
  { key: "spamScoreAutoHideThreshold", label: "Spam auto-hide threshold", hint: "Submissions scoring at or above this (0–100) are hidden instead of queued as pending.", type: "number" },
  { key: "autoHideReportThreshold", label: "Report auto-hide threshold", hint: "A published review is auto-hidden once it collects this many reports.", type: "number" },
  { key: "promptThrottleDays", label: "Prompt cooldown (days)", hint: "Minimum days between smart review-prompt nudges for the same user.", type: "number" },
  { key: "promptMaxLifetime", label: "Max lifetime prompts", hint: "A user is never prompted more than this many times, ever.", type: "number" },
  { key: "emailDrip1DelayHours", label: "Drip email 1 delay (hours)", hint: "Sent this many hours after a review prompt is shown, if still unreviewed.", type: "number" },
  { key: "emailDrip2DelayDays", label: "Drip email 2 delay (days)", hint: "Sent this many days after email 1, if still unreviewed.", type: "number" },
  { key: "emailDrip3DelayDays", label: "Drip email 3 delay (days)", hint: "Sent this many days after email 2 — the final reminder.", type: "number" },
];

export default function AdminReviewSettingsPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-review-settings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/reviews/settings", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load settings");
      return (await res.json()) as { settings: ReviewSettings };
    },
    enabled: !!token,
  });

  // Local editable copy so a field's own onBlur-save doesn't fight the
  // query's cached value while other fields are mid-edit.
  const [settings, setSettings] = useState<ReviewSettings | null>(null);
  useEffect(() => { if (data) setSettings(data.settings); }, [data]);

  const saveMutation = useMutation({
    mutationFn: async ({ key, value }: { key: keyof ReviewSettings; value: number | boolean }) => {
      const res = await fetch("/api/admin/reviews/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed.");
    },
    onMutate: ({ key, value }) => {
      const prev = settings?.[key];
      setSettings((s) => (s ? { ...s, [key]: value } : s));
      return { prevKey: key, prevValue: prev };
    },
    onSuccess: () => {
      showToast("Saved", "success");
      queryClient.invalidateQueries({ queryKey: ["admin-review-settings"] });
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx) setSettings((s) => (s ? { ...s, [ctx.prevKey]: ctx.prevValue } : s));
      showToast(e.message, "error");
    },
  });

  return (
    <AdminShell title="Review Settings">
      <Link href="/admin/reviews" className="text-xs font-semibold text-gray-500 hover:text-gray-800">← Back to Reviews</Link>

      {isError ? (
        <div className="mt-4"><ErrorCard onRetry={refetch} /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mt-4 max-w-xl divide-y divide-gray-50">
          {isLoading || !settings ? (
            <p className="text-sm text-gray-400 p-6">Loading…</p>
          ) : (
            FIELDS.map((f) => {
              const savingThis = saveMutation.isPending && saveMutation.variables?.key === f.key;
              return (
              <div key={f.key} className="flex items-center justify-between gap-4 px-6 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{f.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{f.hint}</p>
                </div>
                {f.type === "boolean" ? (
                  <button
                    onClick={() => saveMutation.mutate({ key: f.key, value: !settings[f.key] })}
                    disabled={savingThis}
                    className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 ${settings[f.key] ? "bg-blue-600" : "bg-gray-200"}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings[f.key] ? "translate-x-5.5 left-0.5" : "left-0.5"}`} />
                  </button>
                ) : (
                  <input
                    type="number"
                    defaultValue={settings[f.key] as number}
                    onBlur={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (!isNaN(n) && n !== settings[f.key]) saveMutation.mutate({ key: f.key, value: n });
                    }}
                    disabled={savingThis}
                    className="w-24 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>
              );
            })
          )}
        </div>
      )}
    </AdminShell>
  );
}
