// /billing is a permanent top-level route (linked from ToolsSidebar, the
// settings hub, etc. — see app/dashboard/settings/layout.tsx), not nested
// under /dashboard/*, so it needs its own layout file to pick up the same
// logged-in chrome (DashboardHeader + ToolsSidebar) every /dashboard/* page
// gets. Shares the boilerplate with app/dashboard/layout.tsx via AppShellLayout.

import AppShellLayout from "@/app/components/AppShellLayout";

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return <AppShellLayout>{children}</AppShellLayout>;
}
