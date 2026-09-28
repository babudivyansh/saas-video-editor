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

type LinkItem = { label: string; href: string };

// Every href resolves to a real public route, an on-page anchor, or a mailto.
// The Video / AI / Free Tools columns mirror the navbar (single source of truth).
const COLUMNS: { title: string; links: LinkItem[] }[] = [
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
      // The only permanent link into /reviews. The hero rating badge is the
      // other one, and it's hidden below MINIMUM_REVIEWS_FOR_SCHEMA — so
      // without this row the review flow is unreachable by clicking until
      // three reviews already exist.
      { label: "Reviews", href: "/reviews" },
      { label: "Contact", href: "/contact" },
      { label: "Affiliate Program", href: "/affiliate-program" },
    ],
  },
  { title: "Video Tools", links: asLinks(VIDEO_TOOLS) },
  { title: "AI Tools", links: asLinks(AI_TOOLS) },
  { title: "Free Tools", links: asLinks(FREE_FEATURES) },
];

// Lives in the bottom bar rather than a column, but every row must stay:
// /refund and /affiliate-tos previously had no entry point anywhere on the site.
const LEGAL: LinkItem[] = [
  { label: "Legal hub", href: "/legal" },
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Refund policy", href: "/refund" },
  { label: "Cookies", href: "/cookies" },
  { label: "Affiliate TOS", href: "/affiliate-tos" },
];

// The oversized wordmark along the bottom edge. Colours come from tokens (the
// theme-debt ratchet counts inline hex): emerald ramp brightest in the middle,
// fading into the card at both ends.
const WORDMARK_GRADIENT = `linear-gradient(90deg,
  transparent 8%,
  color-mix(in oklab, var(--emerald-brand) 70%, var(--bg)) 22%,
  var(--emerald-bright) 40%,
  color-mix(in oklab, var(--emerald-bright) 72%, var(--fg)) 55%,
  var(--emerald-bright) 70%,
  color-mix(in oklab, var(--emerald-brand) 70%, var(--bg)) 80%,
  transparent 94%)`;

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
    <footer className="bg-bg px-4 py-10 font-sans md:px-8 md:py-16">
      {/* container-type lets the wordmark size itself to the card, not the viewport */}
      <div className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border border-line bg-surface-1 [container-type:inline-size]">
        <div className="px-6 pt-12 sm:px-10 md:px-16 md:pt-[72px]">
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-[1.7fr_repeat(5,minmax(0,1fr))]">
            {/* Brand blurb */}
            <div className="col-span-2 sm:col-span-3 lg:col-span-1">
              <Link href="/" className="inline-flex" aria-label="Clipiro home">
                <ClipiroLogo className="h-11" />
              </Link>
              <p className="mt-5 max-w-xs text-[15px] leading-relaxed text-fg-muted">
                Turn long videos into viral short-form content with AI clipping, captions, and one-click export.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-1.5">
                {SOCIALS.map((s) => {
                  const external = s.href.startsWith("http");
                  return (
                    <a
                      key={s.label}
                      href={s.href}
                      aria-label={s.label}
                      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-fg-muted transition-colors hover:border-emerald-bright hover:text-emerald-bright"
                    >
                      {s.icon}
                    </a>
                  );
                })}
              </div>
            </div>

            {/* Link columns */}
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <p className="mb-4 text-base font-semibold text-fg">{col.title}</p>
                <ul className="space-y-3">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link href={link.href} className="text-sm text-fg-muted transition-colors hover:text-emerald-bright">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div className="mt-14 flex flex-col gap-4 text-sm text-fg-muted md:mt-[72px] md:flex-row md:items-center md:justify-between">
            <p>© 2026 Clipiro. All rights reserved.</p>
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {LEGAL.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="transition-colors hover:text-emerald-bright">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Oversized wordmark, cropped by the card's bottom edge. Decorative —
            the logo above is the accessible brand name. */}
        <div
          aria-hidden="true"
          className="pointer-events-none mt-6 select-none overflow-hidden text-center font-black leading-[0.78] tracking-[-0.045em]"
          style={{
            fontSize: "20cqw",
            height: "0.74em",
            backgroundImage: WORDMARK_GRADIENT,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          CLIPIRO
        </div>
      </div>
    </footer>
  );
}
