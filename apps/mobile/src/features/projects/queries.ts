import type { ClipAspect } from "@clipiro/shared";
import { useQuery } from "@tanstack/react-query";
import { getClips, getProject, getProjects } from "@mocks/projects";

// The Projects tab's data. Phase 5 swaps the mock fetchers for the API client.
export const projectKeys = {
  all: ["projects"] as const,
  list: ["projects", "list"] as const,
  detail: (id: string) => ["projects", "detail", id] as const,
  clips: (aspect?: ClipAspect) => ["projects", "clips", aspect ?? "all"] as const,
};

export const useProjects = () => useQuery({ queryKey: projectKeys.list, queryFn: getProjects });
export const useProject = (id: string) => useQuery({ queryKey: projectKeys.detail(id), queryFn: () => getProject(id) });
export const useClips = (aspect?: ClipAspect) => useQuery({ queryKey: projectKeys.clips(aspect), queryFn: () => getClips(aspect) });
