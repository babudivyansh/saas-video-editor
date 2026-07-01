import * as React from "react";
import { cx } from "../../utils/cx";
import { ChevronDownIcon, XIcon } from "../../icons";

export interface NavLinkItem {
  label: string;
  href: string;
}

export interface NavBarProps {
  /** Rendered as-is at the left — pass an <img> or wordmark component. */
  logo: React.ReactNode;
  links: NavLinkItem[];
  cta?: NavLinkItem;
  className?: string;
}

/**
 * Simplified NavBar shell ported from SiteNavbar.tsx's structural pattern
 * (sticky white header, flat nav links, primary CTA, mobile menu). The real
 * app's mega-menu dropdowns are app-specific and not reproduced here.
 */
export function NavBar({ logo, links, cta, className = "" }: NavBarProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  return (
    <header className={cx("sticky top-0 z-40 bg-white border-b border-gray-100 dark:bg-zinc-950 dark:border-zinc-800", className)}>
      <div className="mx-auto flex h-16 max-w-screen-2xl items-center justify-between px-4 lg:px-12">
        {logo}

        <nav className="hidden md:flex items-center gap-8">
          {links.map(link => (
            <a key={link.href} href={link.href} className="text-base font-semibold text-gray-700 hover:text-gray-900 transition-colors dark:text-zinc-300 dark:hover:text-white">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          {cta && (
            <a
              href={cta.href}
              className="hidden md:inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-base font-bold text-white hover:bg-primary-hover hover:scale-[1.02] transition-all"
            >
              {cta.label}
            </a>
          )}
          <button
            type="button"
            aria-label="Toggle menu"
            onClick={() => setMobileOpen(o => !o)}
            className="md:hidden p-2 -mr-2 text-gray-700 dark:text-zinc-300"
          >
            {mobileOpen ? <XIcon className="h-5 w-5" /> : <ChevronDownIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="md:hidden border-t border-gray-100 bg-white px-4 py-4 flex flex-col gap-3 dark:bg-zinc-950 dark:border-zinc-800">
          {links.map(link => (
            <a key={link.href} href={link.href} className="text-base font-semibold text-gray-700 dark:text-zinc-300">
              {link.label}
            </a>
          ))}
          {cta && (
            <a href={cta.href} className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-base font-bold text-white">
              {cta.label}
            </a>
          )}
        </nav>
      )}
    </header>
  );
}
