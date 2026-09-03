import type { ReactNode } from "react";
import SiteFooter from "@/app/components/SiteFooter";
import SiteNavbar from "@/app/components/SiteNavbar";

/**
 * Outer shell for every public marketing page: emerald page surface, navbar,
 * footer.
 *
 * `theme-emerald` opts the subtree into the dark token set (see globals.css).
 * It is applied here rather than at :root so surfaces that have not been
 * migrated yet keep the light theme instead of rendering dark tokens under
 * light utility classes.
 *
 * This replaced `flat-brand`, which existed only to flatten the old
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
    <div className="theme-emerald min-h-screen bg-bg text-fg">
      <SiteNavbar solid />
      <Tag>{children}</Tag>
      <SiteFooter />
    </div>
  );
}
