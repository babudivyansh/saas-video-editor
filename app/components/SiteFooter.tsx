import Link from "next/link";
import {
  ZapIcon, LinkedInIcon, XIcon, YoutubeIcon, GitHubIcon, DiscordIcon,
} from "@/app/components/landing/icons";

// Every href resolves to a real route, an on-page anchor, or a mailto — no 404s.
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
    title: "Resources",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Tutorials", href: "/blog" },
      { label: "Documentation", href: "/blog" },
      { label: "Help Center", href: "mailto:support@clipiro.com" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "mailto:hello@clipiro.com" },
      { label: "Affiliate Program", href: "/affiliate-tos" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
  {
    title: "Features",
    links: [
      { label: "AI Video Clipping", href: "/#features" },
      { label: "Auto Captions", href: "/#features" },
      { label: "Social Formatting", href: "/#features" },
      { label: "AI Hook Generator", href: "/#features" },
      { label: "Multi-Language", href: "/#features" },
      { label: "One-Click Export", href: "/#features" },
    ],
  },
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
    <footer className="border-t border-gray-100 bg-white font-sans">
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-16 md:px-12 lg:px-[120px]">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          {/* Brand blurb */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2 text-xl font-black tracking-tight text-gray-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#335CFF] text-white">
                <ZapIcon className="h-4 w-4" />
              </span>
              CLIPIRO
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
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:border-[#335CFF] hover:text-[#335CFF]"
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
                    <Link href={link.href} className="text-sm text-gray-500 transition-colors hover:text-[#335CFF]">
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
            <Link href="/privacy" className="hover:text-gray-700">Cookies</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
