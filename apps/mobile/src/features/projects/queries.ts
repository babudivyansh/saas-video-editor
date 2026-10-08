import type { ClipAspect, ProjectDetail } from "@clipiro/shared";
import { useQuery } from "@tanstack/react-query";
import { projects } from "@/lib/api";
import { getClips, getProjects } from "@mocks/projects";

// The Projects tab's data. One project (and its clips) comes from the API;
// the lists still come from mocks until Phase 8.
export const projectKeys = {
  all: ["projects"] as const,
  list: ["projects", "list"] as const,
  detail: (id: string) => ["projects", "detail", id] as const,
  clip: (id: string) => ["projects", "clip", id] as const,
  clips: (aspect?: ClipAspect) => ["projects", "clips", aspect ?? "all"] as const,
};

/** Still producing clips: the screen keeps asking until it isn't. */
const working = (p: ProjectDetail | undefined) =>
  !!p && (p.status === "processing" || p.status === "rendering" || p.clips.some((c) => c.status === "queued" || c.status === "rendering"));

export const POLL_MS = 5000;

export const useProjects = () => useQuery({ queryKey: projectKeys.list, queryFn: getProjects });
export const useProject = (id: string) =>
  useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => projects.get(id),
    refetchInterval: (q) => (working(q.state.data) ? POLL_MS : false),
  });
/** One clip with its signed video link and the AI's reasoning. */
export const useClip = (id: string | null) =>
  useQuery({ queryKey: projectKeys.clip(id ?? ""), queryFn: () => projects.clip(id!), enabled: !!id, staleTime: 5 * 60 * 1000 });
export const useClips = (aspect?: ClipAspect) => useQuery({ queryKey: projectKeys.clips(aspect), queryFn: () => getClips(aspect) });
