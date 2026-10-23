import { redirect } from "next/navigation";

// The old "My videos" list was built for the generator products removed in
// 2026-09; projects and their clips live on /dashboard/projects now. Kept as a
// redirect so old links and bookmarks still land somewhere useful.
export default function MyVideosRedirect() {
  redirect("/dashboard/projects");
}
