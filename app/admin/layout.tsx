// Server half of the admin shell: resolves the i18n locale/messages once
// here (same pattern as AppShellLayout, used by app/dashboard/layout.tsx and
// app/billing/layout.tsx) and hands off to AdminLayoutClient, a Client
// Component, since the actual gate/chrome needs hooks.
//
// Admin's own ~300 strings are all hardcoded English — this exists only so
// the shared app/components/ui/* primitives admin is adopting (ConfirmDialog,
// Modal) can resolve their own "Cancel"/"Confirm"/"Close" labels, which they
// pull from next-intl's "Common" namespace and throw without a provider for.

import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import AdminLayoutClient from "./AdminLayoutClient";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AdminLayoutClient>{children}</AdminLayoutClient>
    </NextIntlClientProvider>
  );
}
