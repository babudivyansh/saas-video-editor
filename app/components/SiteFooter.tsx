import Link from "next/link";
import {
  LinkedInIcon, XIcon, InstagramIcon, FacebookIcon, YoutubeIcon, DiscordIcon,
} from "@/app/components/landing/icons";
import { FREE_FEATURES, VIDEO_TOOLS, AI_TOOLS, toolPath, type FeatureLink } from "@/app/components/featureLinks";
import ClipiroLogo from "@/app/components/ClipiroLogo";
// Map the shared feature lists to footer rows. These point at the public
// /tools/<slug> page, not the in-app href — a crawler or a logged-out visitor
// following a /dashboard link gets a login redirect instead of the tool.
const asLinks = (items: FeatureLink[]) => items.map((i) => ({ label: i.title, href: toolPath(i) }));

// Every href resolves to a real public route, an on-page anchor, or a mailto.
// The Video / AI / Free Tools columns mirror the navbar (single source of truth).
const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Pricing", href: "/pricing" },
      { label: "How it works", href: "/#how-it-works" },
      { label: "Help Center", href: "/help" },
      { label: "Updates", href: "/blog" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Blog", href: "/blog" },
      { label: "Contact", href: "/contact" },
      { label: "Affiliate Program", href: "/affiliate-program" },
    ],
  },
  { title: "Video Tools", links: asLinks(VIDEO_TOOLS) },
  { title: "AI Tools", links: asLinks(AI_TOOLS) },
  { title: "Free Tools", links: asLinks(FREE_FEATURES) },
  {
    // Grouped here rather than scattered through Company: /refund and
    // /affiliate-tos previously had no entry point anywhere on the site.
    title: "Legal",
    links: [
      { label: "Legal hub", href: "/legal" },
      { label: "Refund policy", href: "/refund" },
      { label: "Terms of service", href: "/terms" },
      { label: "Privacy policy", href: "/privacy" },
      { label: "Cookies", href: "/cookies" },
      { label: "Affiliate TOS", href: "/affiliate-tos" },
    ],
  },
];

// Social handles are env-driven so they can be updated in production without a
// code change; the hardcoded fallback is the current official handle. Discord
// routes through /discord, which applies its own env override + fallback.
const SOCIALS = [
  { icon: <InstagramIcon className="h-4 w-4" />, label: "Instagram", href: process.env.NEXT_PUBLIC_INSTAGRAM_URL || "https://www.instagram.com/clipiroapp/" },
  { icon: <FacebookIcon className="h-4 w-4" />, label: "Facebook", href: process.env.NEXT_PUBLIC_FACEBOOK_URL || "https://www.facebook.com/profile.php?id=61593101997903" },
  { icon: <LinkedInIcon className="h-4 w-4" />, label: "LinkedIn", href: process.env.NEXT_PUBLIC_LINKEDIN_URL || "https://www.linkedin.com/company/109881774" },
  { icon: <XIcon className="h-4 w-4" />, label: "X (Twitter)", href: process.env.NEXT_PUBLIC_X_URL || "https://x.com/ClipiroOfficial" },
  { icon: <YoutubeIcon className="h-4 w-4" />, label: "YouTube", href: process.env.NEXT_PUBLIC_YOUTUBE_URL || "https://youtube.com/@clipiroofficial" },
  { icon: <DiscordIcon className="h-4 w-4" />, label: "Discord", href: "/discord" },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-card-border bg-surface font-sans">
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-16 md:px-12 lg:px-[120px]">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {/* Brand blurb */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Link href="/" className="inline-flex" aria-label="Clipiro home">
              <ClipiroLogo className="h-13" />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-gray-500">
              Turn long videos into viral short-form content with AI clipping, captions, and one-click export.
            </p>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="mb-4 text-sm font-bold text-gray-900">{col.title}</p>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-gray-500 transition-colors hover:text-brand-deep">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-gray-100 pt-8 sm:flex-row">
          <p className="text-sm text-gray-400">© 2026 Clipiro. All rights reserved.</p>
          <div className="flex items-center gap-2">
            {SOCIALS.map((s) => {
              const external = s.href.startsWith("http");
              return (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:border-brand hover:text-brand-deep"
                >
                  {s.icon}
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </footer>
  );
}
