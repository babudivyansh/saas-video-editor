import { redirect } from "next/navigation";
import { parseSettingsSection } from "@/app/components/settings/sections";

// Settings is an overlay now (SettingsOverlayProvider), not a route tree. These
// URLs stay alive as redirects because they're already out in the world: the
// lifecycle emails' "Manage preferences" footer, the unsubscribe landing
// (which adds ?unsubscribed=), the verify-email page, and bookmarks. They land
// on the dashboard with the panel open at the matching section. A #fragment
// does NOT survive this redirect on a full page load — but in-app links never
// reach it: SettingsOverlayProvider intercepts their clicks and keeps the
// fragment (the receipt page's #billing-details link relies on that).
export default async function SettingsRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ section }, query] = await Promise.all([params, searchParams]);
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") qs.set(key, value);
  }
  qs.set("settings", parseSettingsSection(section?.[0]));
  redirect(`/dashboard?${qs.toString()}`);
}
