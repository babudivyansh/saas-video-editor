"use client";

// Voiceover voice catalogue: show/hide and re-order any voice — the account's
// own and the curated ElevenLabs Voice Library ones (lib/voices/library.ts) —
// through the voice_catalog Config row. No deploy; the picker reads it within
// a minute. "Withdrawn" is the nightly library sync's finding
// (lib/voices/library-sync.ts) and can't be overridden here.

import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminShell from "../AdminShell";
import { ErrorCard } from "../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { TTS_LANGUAGES, ttsLanguageLabel } from "@/lib/voices/models";

interface VoiceRow {
  slug: string;
  label: string;
  description: string | null;
  category: string;
  gender: string;
  accent: string | null;
  languages: string[];
  useCase: string | null;
  previewUrl: string | null;
  active: boolean;
  withdrawn: boolean;
  sortOrder: number;
  override: { active?: boolean; sortOrder?: number } | null;
}

export default function AdminVoicesPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("all");
  const [category, setCategory] = useState("all");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-voices"],
    queryFn: async () => {
      const res = await fetch("/api/admin/voices", { headers: headers() });
      if (!res.ok) throw new Error("Failed to load voices");
      return ((await res.json()) as { voices: VoiceRow[] }).voices;
    },
    enabled: !!token,
  });

  const patch = useMutation({
    mutationFn: async (body: { slug: string; active?: boolean; sortOrder?: number; clear?: boolean }) => {
      const res = await fetch("/api/admin/voices", { method: "PATCH", headers: headers(), body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).issues?.[0]?.message ?? "Update failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-voices"] }),
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const voices = useMemo(() => data ?? [], [data]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return voices.filter((v) =>
      (category === "all" || v.category === category) &&
      (language === "all" || v.languages.includes(language)) &&
      (!q || `${v.label} ${v.slug} ${v.accent ?? ""} ${v.description ?? ""}`.toLowerCase().includes(q)));
  }, [voices, query, language, category]);

  const shown = voices.filter((v) => v.active).length;
  const languagesWithVoices = TTS_LANGUAGES.filter((l) => voices.some((v) => v.languages.includes(l.code)));

  function play(url: string | null) {
    if (!url) return;
    audioRef.current?.pause();
    audioRef.current = new Audio(url);
    void audioRef.current.play().catch(() => {});
  }

  return (
    <AdminShell title="Voices">
      {isError ? (
        <ErrorCard onRetry={refetch} />
      ) : isLoading ? (
        <p className="text-sm text-fg-subtle">Loading…</p>
      ) : (
        <Card shadow padding="none">
          <div className="flex flex-wrap items-end justify-between gap-3 px-6 pt-5 pb-3">
            <div>
              <h2 className="text-base font-bold text-fg">Voiceover voices</h2>
              <p className="text-xs text-fg-subtle">
                {shown} of {voices.length} shown in the picker · changes apply within a minute, no deploy
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, accent…"
                aria-label="Search voices"
                className="rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-sm text-fg"
              />
              <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language" className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-sm text-fg">
                <option value="all">All languages</option>
                {languagesWithVoices.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
              <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Source" className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-sm text-fg">
                <option value="all">All sources</option>
                <option value="starter">Account voices</option>
                <option value="library">Voice Library</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  <th className="px-6 py-3">Voice</th>
                  <th className="px-4 py-3">Language</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3 text-right">Order</th>
                  <th className="px-4 py-3">Shown</th>
                  <th className="px-4 py-3">Override</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((v) => (
                  <tr key={v.slug} className={v.active ? "hover:bg-surface-2" : "opacity-60"}>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => play(v.previewUrl)}
                          disabled={!v.previewUrl}
                          aria-label={`Play ${v.label}`}
                          className="h-7 w-7 shrink-0 rounded-full border border-line text-xs text-fg-muted hover:text-fg disabled:opacity-40"
                        >
                          ▶
                        </button>
                        <div className="min-w-0">
                          <p className="font-semibold text-fg">{v.label}</p>
                          <p className="truncate text-xs text-fg-subtle">
                            {[v.gender, v.accent, v.useCase?.replace(/_/g, " ")].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-fg-muted">
                      {v.category === "library" ? ttsLanguageLabel(v.languages[0]) : "Multilingual"}
                    </td>
                    <td className="px-4 py-3 text-xs text-fg-muted">
                      {v.category === "library" ? "Voice Library" : "Account"}
                      {v.withdrawn && <span className="ml-1.5 rounded bg-error/15 px-1.5 py-0.5 font-semibold text-error">Withdrawn</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        min={0}
                        defaultValue={v.sortOrder}
                        onBlur={(e) => {
                          const n = parseInt(e.target.value, 10);
                          if (Number.isInteger(n) && n >= 0 && n !== v.sortOrder) patch.mutate({ slug: v.slug, sortOrder: n });
                        }}
                        aria-label={`${v.label} order`}
                        className="w-20 rounded-lg border border-line bg-surface-1 px-2 py-1 text-right text-xs text-fg"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold">
                        <input
                          type="checkbox"
                          checked={v.active}
                          disabled={v.withdrawn}
                          onChange={(e) => patch.mutate({ slug: v.slug, active: e.target.checked })}
                        />
                        <span className={v.active ? "text-fg-muted" : "text-error"}>{v.active ? "Shown" : "Hidden"}</span>
                      </label>
                    </td>
                    <td className="px-4 py-3">
                      {v.override ? (
                        <Button variant="link" onClick={() => patch.mutate({ slug: v.slug, clear: true })} className="text-fg-subtle hover:text-error">
                          Reset
                        </Button>
                      ) : (
                        <span className="text-xs text-fg-subtle">default</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="px-6 py-6 text-sm text-fg-subtle">No voices match.</p>}
          </div>
        </Card>
      )}
    </AdminShell>
  );
}
