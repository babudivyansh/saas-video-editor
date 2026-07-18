import { redirect } from "next/navigation";

// Bare /dashboard/profile now lands directly on the Account & Settings hub.
// Kept as a server redirect (not client-side) so it works before AuthContext
// hydrates and there's no flash of unrelated content.
export default function ProfileIndexPage() {
  redirect("/dashboard/settings");
}
