"use client";

// The actual chrome for /dashboard/*: the full-width DashboardHeader + the
// icon-rail ToolsSidebar, wrapping every page's own content. Split out from
// app/dashboard/layout.tsx (now a Server Component, so it can resolve the
// i18n locale/messages server-side) since usePathname() needs a Client
// Component boundary.
//
// Two route families opt out entirely and render bare (no header/sidebar):
// /dashboard/editor (deliberately full-screen) and /dashboard/admin (a
// separate internal admin surface, not part of the end-user dashboard chrome).

import { usePathname } from "next/navigation";
import DashboardHeader from "@/app/components/DashboardHeader";
import ToolsSidebar from "@/app/components/ToolsSidebar";
import { CreditModalProvider } from "@/app/components/billing/CreditModalContext";
import { BillingOverlayProvider, useBillingOverlay } from "@/app/components/billing/BillingOverlayContext";
import { ReviewPromptProvider } from "@/app/components/reviews/ReviewPromptProvider";

const CHROMELESS_PREFIXES = ["/dashboard/editor", "/dashboard/admin"];

// Mirrors ToolsSidebar.tsx's NAV/BOTTOM_NAV ids — longest-prefix match first
// so e.g. "/dashboard/create/auto-clip" resolves to "create", not falling
// through to the "/dashboard" catch-all.
const ROUTE_ACTIVE: { prefix: string; id: string }[] = [
  { prefix: "/dashboard/assets", id: "assets" },
  { prefix: "/dashboard/social-tracker", id: "social" },
  { prefix: "/dashboard/referral", id: "earn" },
  { prefix: "/dashboard/settings", id: "settings" },
  { prefix: "/dashboard/tools", id: "create" },
  { prefix: "/dashboard/create", id: "create" },
  { prefix: "/dashboard/ai-creator", id: "create" },
  { prefix: "/dashboard/cut-and-crop", id: "create" },
  { prefix: "/dashboard/clips", id: "projects" },
  { prefix: "/dashboard/profile", id: "settings" },
];

function activeIdFor(pathname: string): string {
  if (pathname === "/dashboard") return "home";
  const match = ROUTE_ACTIVE.find((r) => pathname.startsWith(r.prefix));
  return match?.id ?? "home";
}

// Billing has no route of its own any more, so the sidebar's active state can't
// come from the pathname — it comes from whether the overlay is showing. This
// has to be a child of BillingOverlayProvider to read that.
function ShellChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isBillingOpen } = useBillingOverlay();

  return (
    // h-[100dvh], not h-screen: 100vh is the address-bar-RETRACTED height on
    // mobile, so the shell sits 50-120px taller than what is actually visible
    // and the document picks up a second scrollbar underneath this one. dvh
    // tracks the real viewport.
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-surface">
      <DashboardHeader />
      <div className="flex flex-1 overflow-hidden">
        <ToolsSidebar active={isBillingOpen ? "billing" : activeIdFor(pathname)} />
        {/*
          `relative` is not cosmetic — it makes this pane the containing block
          for the absolutely-positioned boxes inside it, and `sr-only` is
          exactly that (position:absolute, 1×1, clipped). Without it, a 1px
          screen-reader box resolves against the DOCUMENT at its static offset,
          so one sitting 1,300px down a scrolled pane drags the document out to
          1,300px tall. Measured in production: 386px of phantom document
          scroll from twelve of them, on top of this pane's own scrolling.
          One declaration fixes every sr-only on every dashboard page.

          overscroll-contain then stops a scroll that reaches the end of this
          pane from chaining out to whatever is behind it.
        */}
        <main className="relative flex-1 overflow-y-auto overscroll-contain bg-surface">{children}</main>
      </div>
    </div>
  );
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // CreditModalProvider and ReviewPromptProvider wrap both branches so the
  // chromeless editor gets the shared insufficient-credits (402) modal and
  // the review-prompt system too — the editor's own export-success trigger
  // lives inside this chromeless subtree.
  // Order is load-bearing. Each provider renders its overlay as a *sibling* of
  // children, so an overlay can only use contexts from providers above it:
  //   ReviewPrompt  — needs only useAuth, from the root layout
  //   BillingOverlay — its panel calls useReviewPromptTrigger, so it sits inside
  //   CreditModal   — its 402 modal links into billing, so it sits inside that
  if (CHROMELESS_PREFIXES.some((p) => pathname.startsWith(p))) {
    return (
      <ReviewPromptProvider>
        <BillingOverlayProvider>
          <CreditModalProvider>{children}</CreditModalProvider>
        </BillingOverlayProvider>
      </ReviewPromptProvider>
    );
  }

  return (
    <ReviewPromptProvider>
      <BillingOverlayProvider>
        <CreditModalProvider>
          <ShellChrome>{children}</ShellChrome>
        </CreditModalProvider>
      </BillingOverlayProvider>
    </ReviewPromptProvider>
  );
}
