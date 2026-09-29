"use client";

// Operations control center: health overview, scheduled jobs (run / pause),
// render queues, flags + maintenance, and the incident probes — one page,
// one snapshot (GET /api/admin/ops), a tab per area. ?tab= deep-links a tab.

import { Suspense, useCallback, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import AdminShell from "../AdminShell";
import { ErrorCard } from "../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { Tabs } from "@/app/components/ui/Tabs";
import { useToast } from "@/app/components/ui/Toast";
import { OverviewTab } from "./_components/OverviewTab";
import { JobsTab } from "./_components/JobsTab";
import { QueuesTab } from "./_components/QueuesTab";
import { FlagsTab } from "./_components/FlagsTab";
import { ServicesTab } from "./_components/ServicesTab";
import { IncidentTools } from "./_components/IncidentTools";
import { jobState, type AssetsAdminData, type OpsData } from "./_components/types";

const TAB_IDS = ["overview", "jobs", "queues", "services", "flags", "incident"] as const;
// A manual run that hasn't reported back in this long is given up on.
const PENDING_TIMEOUT_MS = 10 * 60 * 1000;

function OpsConsole() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("tab");
  const tab = (TAB_IDS as readonly string[]).includes(requested ?? "") ? (requested as string) : "overview";

  // runId → when its manual run started. Mirrored in a ref so the query
  // function (which settles pending runs as results land) reads the latest.
  const [pending, setPendingState] = useState<Record<string, string>>({});
  const pendingRef = useRef<Record<string, string>>({});
  const setPending = (next: Record<string, string>) => {
    pendingRef.current = next;
    setPendingState(next);
  };

  const headers = useCallback(() => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }), [token]);

  const { data: d, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-ops"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ops", { headers: headers() });
      if (!res.ok) throw new Error("Failed to load operations data");
      const data = (await res.json()) as OpsData;
      settlePending(data);
      return data;
    },
    enabled: !!token,
    // Poll fast while a manual run is in flight, slowly otherwise.
    refetchInterval: Object.keys(pending).length > 0 ? 3000 : 30_000,
  });

  function settlePending(data: OpsData) {
    const open = pendingRef.current;
    if (Object.keys(open).length === 0) return;
    const next = { ...open };
    for (const [runId, startedAt] of Object.entries(open)) {
      const job = data.cronJobs.find((j) => j.runId === runId);
      const last = job?.status?.lastRunAt;
      if (job && last && last >= startedAt) {
        delete next[runId];
        if (jobState(job) === "failing") showToast(`${job.label} failed: ${job.status?.lastError ?? "see the job row"}`, "error");
        else showToast(`${job.label} finished OK`, "success");
      } else if (new Date().getTime() - new Date(startedAt).getTime() > PENDING_TIMEOUT_MS) {
        delete next[runId];
        showToast(`${job?.label ?? runId} hasn't reported back after 10 minutes — check the server log.`, "error");
      }
    }
    setPending(next);
  }

  const { data: assets } = useQuery({
    queryKey: ["admin-assets"],
    queryFn: async () => {
      const res = await fetch("/api/admin/assets", { headers: headers() });
      if (!res.ok) throw new Error("Failed to load assets");
      return (await res.json()) as AssetsAdminData;
    },
    enabled: !!token,
  });

  const go = (id: string) => router.replace(`/admin/ops?tab=${id}`, { scroll: false });

  if (isError) return <ErrorCard onRetry={refetch} />;
  if (isLoading || !d) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 bg-surface-3 rounded-xl" />
        <div className="h-32 bg-surface-3 rounded-2xl" />
        <div className="h-64 bg-surface-3 rounded-2xl" />
      </div>
    );
  }

  const attention = d.cronJobs.filter((j) => ["failing", "never"].includes(jobState(j))).length;

  return (
    <>
      {d.maintenance.on && (
        <p className="text-sm font-semibold text-warning bg-warning/10 border border-warning/30 rounded-lg px-4 py-2 mb-4">
          Maintenance mode is ON — non-admin API traffic is being refused with 503.
        </p>
      )}
      <Tabs
        // Controlled by ?tab=, so an Overview tile and back/forward switch it too.
        label="Operations"
        activeId={tab}
        onChange={go}
        items={[
          { id: "overview", label: "Overview", content: <OverviewTab data={d} assets={assets} go={go} /> },
          {
            id: "jobs",
            label: "Scheduled jobs",
            badge: attention > 0 ? attention : undefined,
            content: (
              <JobsTab
                data={d}
                headers={headers}
                pending={pending}
                onStarted={(runId, at) => setPending({ ...pendingRef.current, [runId]: at })}
                refresh={() => refetch()}
              />
            ),
          },
          {
            id: "queues",
            label: "Queues",
            badge: d.failedJobs.length > 0 ? d.failedJobs.length : undefined,
            content: <QueuesTab data={d} headers={headers} refresh={() => refetch()} />,
          },
          { id: "services", label: "Services", content: <ServicesTab headers={headers} /> },
          { id: "flags", label: "Flags & maintenance", content: <FlagsTab data={d} headers={headers} /> },
          { id: "incident", label: "Incident tools", content: <IncidentTools headers={headers} /> },
        ]}
      />
    </>
  );
}

export default function AdminOpsPage() {
  return (
    <AdminShell title="Operations">
      <Suspense fallback={null}>
        <OpsConsole />
      </Suspense>
    </AdminShell>
  );
}
