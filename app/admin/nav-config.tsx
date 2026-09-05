// Single source of truth for the admin sidebar nav — shared by AdminShell's
// sidebar/drawer and DashboardHeader's jump-search, so the two can't drift
// out of sync with each other the way they previously did (DashboardHeader
// had its own hand-copied list, missing an entry that NAV already had).
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Users, Star, Calendar, Tag, Ticket, Wrench, Cpu,
  Receipt, BarChart3, Server, ScrollText, Gift, Megaphone,
} from "lucide-react";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

// Grouped for the sidebar. Fourteen flat peers gave no signal that Coupons and
// Pricing are the same kind of thing while Audit Log is not; the destinations
// are unchanged, only their arrangement.
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin",             label: "Dashboard",     icon: LayoutDashboard, exact: true  },
      { href: "/admin/analytics",   label: "Analytics",     icon: BarChart3,       exact: false },
    ],
  },
  {
    label: "Revenue",
    items: [
      { href: "/admin/subscriptions", label: "Subscriptions", icon: Calendar, exact: false },
      { href: "/admin/purchases",     label: "Purchases",     icon: Receipt,  exact: false },
      { href: "/admin/pricing",       label: "Pricing",       icon: Tag,      exact: false },
      { href: "/admin/coupons",       label: "Coupons",       icon: Ticket,   exact: false },
      { href: "/admin/affiliate",     label: "Affiliates",    icon: Gift,     exact: false },
    ],
  },
  {
    label: "Users",
    items: [
      { href: "/admin/users",         label: "Users",         icon: Users,     exact: false },
      { href: "/admin/reviews",       label: "Reviews",       icon: Star,      exact: false },
      { href: "/admin/announcements", label: "Announcements", icon: Megaphone, exact: false },
    ],
  },
  {
    label: "Product",
    items: [
      { href: "/admin/tools",  label: "Tools",     icon: Wrench, exact: false },
      { href: "/admin/models", label: "AI Models", icon: Cpu,    exact: false },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/ops",   label: "Operations", icon: Server,     exact: false },
      { href: "/admin/audit", label: "Audit Log",  icon: ScrollText, exact: false },
    ],
  },
];

// Flat view, derived so the two can't drift: DashboardHeader's jump-search and
// anything else that just wants "every admin destination" reads this.
export const ADMIN_NAV: AdminNavItem[] = ADMIN_NAV_GROUPS.flatMap((g) => g.items);
