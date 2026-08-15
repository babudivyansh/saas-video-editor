import type { ReactNode } from "react";
import SiteFooter from "@/app/components/SiteFooter";
import SiteNavbar from "@/app/components/SiteNavbar";

/**
 * Outer shell for every public marketing page: white page surface, solid
 * navbar, footer.
 *
 * The root <body> is `bg-zinc-950` for the editor/dashboard, so each marketing
 * page has to re-establish `bg-white` itself — doing it here means no page can
 * forget.
 */
export default function MarketingShell({
  children,
  as: Tag = "main",
}: {
  children: ReactNode;
  /** `article` for long-form documents, so the content keeps its own semantics. */
  as?: "main" | "article";
}) {
  return (
    <div className="min-h-screen bg-white">
      <SiteNavbar solid />
      <Tag>{children}</Tag>
      <SiteFooter />
    </div>
  );
}
