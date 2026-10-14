import { redirect } from "next/navigation";

// The old "My Clips" library. Projects and their clips live on
// /dashboard/projects now; keep old links and bookmarks working.
export default function ClipsLibraryRedirect() {
  redirect("/dashboard/projects");
}
