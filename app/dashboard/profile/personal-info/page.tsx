import { redirect } from "next/navigation";

// Personal Info's fields moved into the new Settings hub (see
// app/dashboard/settings/layout.tsx): identity/avatar/gender/intended-use →
// Profile, password/email/2FA → Security, sign-out/deactivate/delete →
// Danger Zone. This redirect keeps the one existing inbound link (this
// project's own /docs/api page previously only linked settings/api-keys, but
// external bookmarks to this exact URL are common enough to be worth not
// breaking) working instead of landing on a dead page.
export default function PersonalInfoRedirectPage() {
  redirect("/dashboard/settings/profile");
}
