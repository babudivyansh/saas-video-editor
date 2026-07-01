import * as React from "react";
import { cx } from "../../utils/cx";

export interface FooterColumn {
  title: string;
  links: { label: string; href: string }[];
}

export interface FooterSocial {
  icon: React.ReactNode;
  label: string;
  href: string;
}

export interface FooterProps {
  logo: React.ReactNode;
  tagline?: string;
  columns: FooterColumn[];
  socials?: FooterSocial[];
  copyright: string;
  bottomLinks?: { label: string; href: string }[];
  className?: string;
}

/** Ported from SiteFooter.tsx's structural pattern: brand blurb + link columns + bottom bar. */
export function Footer({ logo, tagline, columns, socials = [], copyright, bottomLinks = [], className = "" }: FooterProps) {
  return (
    <footer className={cx("border-t border-gray-100 bg-white dark:bg-zinc-950 dark:border-zinc-800", className)}>
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-16 md:px-12">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            {logo}
            {tagline && <p className="mt-4 max-w-xs text-sm leading-relaxed text-gray-500 dark:text-zinc-400">{tagline}</p>}
            {socials.length > 0 && (
              <div className="mt-5 flex items-center gap-2">
                {socials.map(s => (
                  <a
                    key={s.label}
                    href={s.href}
                    aria-label={s.label}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:border-primary hover:text-primary dark:border-zinc-700"
                  >
                    {s.icon}
                  </a>
                ))}
              </div>
            )}
          </div>

          {columns.map(col => (
            <div key={col.title}>
              <p className="mb-4 text-sm font-bold text-gray-900 dark:text-zinc-100">{col.title}</p>
              <ul className="space-y-2.5">
                {col.links.map(link => (
                  <li key={link.label}>
                    <a href={link.href} className="text-sm text-gray-500 transition-colors hover:text-primary dark:text-zinc-400">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-gray-100 pt-8 sm:flex-row dark:border-zinc-800">
          <p className="text-sm text-gray-400">{copyright}</p>
          {bottomLinks.length > 0 && (
            <div className="flex items-center gap-6 text-sm text-gray-400">
              {bottomLinks.map(link => (
                <a key={link.label} href={link.href} className="hover:text-gray-700 dark:hover:text-zinc-200">
                  {link.label}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
