// Where a project and a clip live in the web app. Every link to one goes
// through here, so the next move is one edit, not a grep.

export function projectHref(projectId: string): string {
  return `/dashboard/projects/${encodeURIComponent(projectId)}`;
}

/** A clip, opened in its project's popup. */
export function clipHref(projectId: string, clipId: string): string {
  return `${projectHref(projectId)}?preview=${encodeURIComponent(clipId)}`;
}

/** A clip, opened straight in the clip editor. */
export function clipEditorHref(projectId: string, clipId: string): string {
  return `${projectHref(projectId)}?clip=${encodeURIComponent(clipId)}`;
}

export const PROJECTS_HREF = "/dashboard/projects";
