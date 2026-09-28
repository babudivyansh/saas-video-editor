import { redirect } from "next/navigation";

// Messages now lives inside the Settings overlay. Kept as a redirect
// (not a deleted route) so any existing bookmarks/links keep working.
export default function MessageRedirectPage() {
  redirect("/dashboard?settings=messages");
}
