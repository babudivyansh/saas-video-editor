"use client";

// Connected services: every outside account the app uses, whether it's
// configured, and — on Test — whether its key actually works, with usage
// where the provider reports it. Nothing is called until you press a button.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { useToast } from "@/app/components/ui/Toast";
import type { Headers } from "./types";

interface ServiceStatus {
  id: string;
  label: string;
  category: string;
  purpose: string;
  configured: boolean;
  testable: boolean;
  ok: boolean | null;
  latencyMs: number | null;
  detail: string;
  usage?: { used: number; limit: number; unit: string };
}

const CATEGORY_LABEL: Record<string, string> = {
  core: "Core infrastructure",
  billing: "Billing",
  email: "Email",
  ai: "AI providers",
  media: "Media",
  social: "Social + sign-in",
  monitoring: "Monitoring",
};

export function ServicesTab({ headers }: { headers: Headers }) {
  const { showToast } = useToast();
  const [results, setResults] = useState<Record<string, ServiceStatus>>({});
  const [testing, setTesting] = useState<Set<string>>(new Set());

  const list = useQuery({
    queryKey: ["admin-services"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ops/services", { headers: headers() });
      if (!res.ok) throw new Error("Failed to load services");
      return ((await res.json()) as { services: ServiceStatus[] }).services;
    },
  });

  async function test(id: string) {
    setTesting((t) => new Set(t).add(id));
    try {
      const res = await fetch(`/api/admin/ops/services?id=${encodeURIComponent(id)}`, { headers: headers() });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Check failed");
      setResults((r) => ({ ...r, ...Object.fromEntries((d.services as ServiceStatus[]).map((s) => [s.id, s])) }));
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setTesting((t) => {
        const n = new Set(t);
        n.delete(id);
        return n;
      });
    }
  }

  if (list.isError) return <p className="text-sm text-error">Couldn&apos;t load services.</p>;
  if (list.isLoading || !list.data) return <div className="h-48 bg-surface-3 rounded-2xl animate-pulse" />;

  const services = list.data.map((s) => results[s.id] ?? s);
  const categories = [...new Set(services.map((s) => s.category))];
  const failing = services.filter((s) => s.ok === false).length;
  const unconfigured = services.filter((s) => !s.configured).length;

  return (
    <div className="space-y-5">
      <Card shadow padding="md">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-fg-muted flex-1 min-w-[14rem]">
            {services.length} services · {unconfigured} not configured{failing ? ` · ${failing} failing` : ""}. Checks use each provider&apos;s free identity endpoint — nothing billable runs.
          </p>
          <Button size="sm" variant="primary" loading={testing.has("all")} onClick={() => test("all")}>Test all</Button>
        </div>
      </Card>

      {categories.map((cat) => (
        <section key={cat}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle mb-2">{CATEGORY_LABEL[cat] ?? cat}</h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {services.filter((s) => s.category === cat).map((s) => {
              const tone = !s.configured ? "neutral" : s.ok === true ? "success" : s.ok === false ? "error" : "info";
              const label = !s.configured ? "Not configured" : s.ok === true ? "Working" : s.ok === false ? "Failing" : "Configured";
              const pct = s.usage ? Math.min(100, Math.round((s.usage.used / Math.max(1, s.usage.limit)) * 100)) : null;
              return (
                <li key={s.id}>
                  <Card padding="md" className="h-full">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-fg">{s.label}</h3>
                        <p className="text-[11px] text-fg-subtle">{s.purpose}</p>
                      </div>
                      <StatusBadge tone={tone}>{label}</StatusBadge>
                    </div>
                    <p className={`text-xs mt-2 break-words ${s.ok === false ? "text-error" : "text-fg-muted"}`}>
                      {s.detail}
                      {s.latencyMs != null && <span className="text-fg-subtle"> · {s.latencyMs} ms</span>}
                    </p>
                    {s.usage && pct != null && (
                      <div className="mt-2">
                        <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${s.label} usage`}>
                          <div className={`h-full ${pct >= 90 ? "bg-error" : pct >= 70 ? "bg-warning" : "bg-success"}`} style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-[11px] text-fg-subtle mt-1">
                          {s.usage.used.toLocaleString()} / {s.usage.limit.toLocaleString()} {s.usage.unit} ({pct}%)
                        </p>
                      </div>
                    )}
                    {s.configured && s.testable && (
                      <Button size="sm" variant="secondary" className="mt-3" loading={testing.has(s.id)} onClick={() => test(s.id)}>
                        Test
                      </Button>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
