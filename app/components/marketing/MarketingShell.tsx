import type { ReactNode } from "react";
import SiteFooter from "@/app/components/SiteFooter";
import SiteNavbar from "@/app/components/SiteNavbar";

/**
 * Outer shell for every public marketing page: emerald page surface, navbar,
 * footer.
 *
 * The dark token set comes from `theme-emerald` on <body> (app/layout.tsx),
 * not from here — portalled surfaces mount to document.body and would escape a
 * per-shell scope.
 *
 * This shell replaced `flat-brand`, which existed only to flatten the old
 * blue-to-fuchsia gradient down to a solid brand blue on marketing while the
 * dashboard kept the gradient. The emerald system has one accent family, so
 * there is nothing left to fork.
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
    <div className="min-h-screen bg-bg text-fg">
      <SiteNavbar solid />
      <Tag>{children}</Tag>
      <SiteFooter />
    </div>
  );
}
