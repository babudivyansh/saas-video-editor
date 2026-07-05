import Link from "next/link";
import {
  LinkedInIcon, XIcon, YoutubeIcon, GitHubIcon, DiscordIcon,
} from "@/app/components/landing/icons";
import { FREE_FEATURES, VIDEO_TOOLS, AI_TOOLS, type FeatureLink } from "@/app/components/featureLinks";
import ClipiroLogo from "@/app/components/ClipiroLogo";

// Map the shared feature lists (title/desc/href) to footer link rows (label/href).
const asLinks = (items: FeatureLink[]) => items.map((i) => ({ label: i.title, href: i.href }));

// Every href resolves to a real route, an on-page anchor, or a mailto — no 404s.
// The Video / AI / Free Tools columns mirror the navbar (single source of truth).
const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Pricing", href: "/pricing" },
      { label: "How it works", href: "/#how-it-works" },
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
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
  { title: "Video Tools", links: asLinks(VIDEO_TOOLS) },
  { title: "AI Tools", links: asLinks(AI_TOOLS) },
  { title: "Free Tools", links: asLinks(FREE_FEATURES) },
];

const SOCIALS = [
  { icon: <LinkedInIcon className="h-4 w-4" />, label: "LinkedIn", href: "#" },
  { icon: <XIcon className="h-4 w-4" />, label: "X (Twitter)", href: "#" },
  { icon: <YoutubeIcon className="h-4 w-4" />, label: "YouTube", href: "#" },
  { icon: <GitHubIcon className="h-4 w-4" />, label: "GitHub", href: "#" },
  { icon: <DiscordIcon className="h-4 w-4" />, label: "Discord", href: "#" },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-card-border bg-surface font-sans">
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-16 md:px-12 lg:px-[120px]">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-6">
          {/* Brand blurb */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Link href="/" className="inline-flex" aria-label="Clipiro home">
              <ClipiroLogo className="h-13" />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-gray-500">
              Turn long videos into viral short-form content with AI clipping, captions, and one-click export.
            </p>
            <div className="mt-5 flex items-center gap-2">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:border-brand hover:text-brand-deep"
                >
                  {s.icon}
                </a>
              ))}
            </div>
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
          <div className="flex items-center gap-6 text-sm text-gray-400">
            <Link href="/privacy" className="hover:text-gray-700">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-gray-700">Terms</Link>
            <Link href="/cookies" className="hover:text-gray-700">Cookies</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
