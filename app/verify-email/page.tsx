import { redirect } from "next/navigation";

// Email verification is a 6-digit code now (Settings → Security, or the
// sign-in step), not a link. Links sent before the change land here — send
// them to where the code can be requested.
export default function VerifyEmailPage() {
  redirect("/dashboard?settings=security");
}
