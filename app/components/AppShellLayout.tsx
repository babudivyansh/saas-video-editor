// Shared server-side shell for any top-level route that should render the
// logged-in app chrome (DashboardHeader + ToolsSidebar): resolves the i18n
// locale/messages once here (from the cookie set by login / the language
// switcher — see i18n/request.ts) and hands off to DashboardShell, a Client
// Component, since usePathname() needs one. Used by both app/dashboard/layout.tsx
// and app/billing/layout.tsx so the two don't duplicate this boilerplate.

import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import DashboardShell from "@/app/components/DashboardShell";

export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DashboardShell>{children}</DashboardShell>
    </NextIntlClientProvider>
  );
}
