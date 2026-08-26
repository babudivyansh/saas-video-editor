// Single source of truth for the admin sidebar nav — shared by AdminShell's
// sidebar/drawer and DashboardHeader's jump-search, so the two can't drift
// out of sync with each other the way they previously did (DashboardHeader
// had its own hand-copied list, missing an entry that NAV already had).
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Users, Star, Calendar, Tag, Ticket, Wrench, Cpu,
  Receipt, BarChart3, Server, ScrollText, Gift,
} from "lucide-react";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
}

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin",               label: "Dashboard",     icon: LayoutDashboard, exact: true  },
  { href: "/admin/users",         label: "Users",         icon: Users,           exact: false },
  { href: "/admin/reviews",       label: "Reviews",       icon: Star,            exact: false },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: Calendar,        exact: false },
  { href: "/admin/pricing",       label: "Pricing",       icon: Tag,             exact: false },
  { href: "/admin/coupons",       label: "Coupons",       icon: Ticket,          exact: false },
  { href: "/admin/tools",         label: "Tools",         icon: Wrench,          exact: false },
  { href: "/admin/models",        label: "AI Models",     icon: Cpu,             exact: false },
  { href: "/admin/purchases",     label: "Purchases",     icon: Receipt,         exact: false },
  { href: "/admin/analytics",     label: "Analytics",     icon: BarChart3,       exact: false },
  { href: "/admin/ops",           label: "Operations",    icon: Server,          exact: false },
  { href: "/admin/audit",         label: "Audit Log",     icon: ScrollText,      exact: false },
  { href: "/admin/affiliate",     label: "Affiliates",    icon: Gift,            exact: false },
];
