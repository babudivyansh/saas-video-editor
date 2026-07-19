// Server Component wrapper: resolves the i18n locale/messages once here
// (from the cookie set by login / the language switcher — see
// i18n/request.ts) and provides them to the whole /dashboard/* subtree.
// Scoped to just this subtree — not the root layout — so the public
// marketing site keeps static generation instead of being forced dynamic
// by a per-request cookie read it doesn't need.
//
// Actual chrome (header, icon rail, pathname-based active state) lives in
// DashboardShell, a Client Component, since usePathname() needs one.

import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import DashboardShell from "@/app/components/DashboardShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DashboardShell>{children}</DashboardShell>
    </NextIntlClientProvider>
  );
}
