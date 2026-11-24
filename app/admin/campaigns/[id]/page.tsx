"use client";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import AdminShell from "../../AdminShell";
import { ErrorCard } from "../../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { CampaignEditor } from "../_components/CampaignEditor";
import { useCampaignApi } from "../_components/useCampaignApi";
import type { Campaign } from "../_components/types";

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const api = useCampaignApi();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-campaign", id],
    queryFn: () => api<{ campaign: Campaign }>(`/${id}`),
    enabled: !!token && user?.role === "ADMIN" && !!id,
  });

  const c = data?.campaign;
  return (
    <AdminShell title={c?.name || "Campaign"}>
      {isError ? (
        <ErrorCard onRetry={refetch} />
      ) : isLoading || !c ? (
        <p className="text-sm text-fg-subtle">Loading campaign…</p>
      ) : (
        // Keyed on status + updatedAt so the editor's local copy resets after
        // any server-side change (schedule, unschedule, save).
        <CampaignEditor
          key={`${c.status}:${c.updatedAt}`}
          campaign={c}
          initial={{ name: c.name, subject: c.subject, preheader: c.preheader, blocks: c.blocks, audience: c.audience }}
        />
      )}
    </AdminShell>
  );
}
