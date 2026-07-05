"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import { ZapIcon, ChevronDownIcon } from "@/app/components/landing/icons";
import ClipiroLogo from "@/app/components/ClipiroLogo";
import {
  FREE_FEATURES, VIDEO_TOOLS, AI_TOOLS, RESOURCES,
  type FeatureLink as NavItem,
} from "@/app/components/featureLinks";

// Renders a dropdown row (title + description), handling internal vs external links.
function DropdownItem({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const className =
    "flex flex-col gap-0.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-gray-50 group";
  const content = (
    <>
      <span className="text-sm font-semibold text-gray-900 group-hover:text-brand-deep transition-colors">{item.title}</span>
      <span className="text-xs leading-snug text-gray-500">{item.desc}</span>
    </>
  );
  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" onClick={onNavigate} className={className}>
        {content}
      </a>
    );
  }
  return (
    <Link href={item.href} onClick={onNavigate} className={className}>
      {content}
    </Link>
  );
}

// Generic dropdown shell. Opens on hover (and click, for touch) and closes when
// the cursor leaves the trigger+panel, with a small delay so crossing the gap
// between them doesn't flicker it shut. `align` controls anchoring: "center"
// (default, narrow menu sits under its trigger) or "screen" (wide mega-menu is
// centred on the viewport via fixed positioning, just below the 64px header).
function NavDropdown({
  label,
  children,
  width,
  align = "center",
}: {
  label: string;
  children: React.ReactNode;
  width: number;
  align?: "center" | "screen";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Clear any pending close timer on unmount.
  useEffect(() => cancelClose, []);

  const positionClass =
    align === "screen"
      ? "fixed top-[80px] left-1/2 -translate-x-1/2"
      : "absolute top-full mt-3 left-1/2 -translate-x-1/2";

  return (
    <div
      className="relative"
      ref={ref}
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1 text-base font-semibold text-gray-700 hover:text-gray-900 transition-colors"
      >
        {label}
        <ChevronDownIcon className={`w-4 h-4 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          className={`${positionClass} rounded-2xl border border-gray-100 bg-white shadow-xl z-50`}
          style={{ width, maxWidth: "calc(100vw - 1.5rem)" }}
        >
          <div onClick={() => setOpen(false)}>{children}</div>
        </div>
      )}
    </div>
  );
}

// Shared marketing/public navbar. Used by the home, pricing, billing, about,
// blog, and legal pages. `solid` forces the white background regardless of
// scroll position — use on pages that don't sit over a hero.
export default function SiteNavbar({ solid = false }: { solid?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const { user, openAuthModal } = useAuth();

  useEffect(() => {
    if (solid) return;
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [solid]);

  // Navbar background, matched to crayo.ai: a translucent white gradient that
  // fades to transparent toward the bottom, with the backdrop-blur masked to fade
  // out too. The bar dissolves into the page — no border, no shadow, no hard line.
  // It cross-fades in on scroll (and is always shown on `solid` pages).
  const showBar = solid || scrolled;
  const barStyle: React.CSSProperties = {
    background:
      "linear-gradient(to bottom, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.7) 70%, rgba(255,255,255,0.4) 95%, transparent 100%)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    maskImage: "linear-gradient(to bottom, black 0%, black 90%, transparent 100%)",
    WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 90%, transparent 100%)",
  };
  const closeMobile = () => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-50 font-sans">
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${showBar ? "opacity-100" : "opacity-0"}`}
        style={barStyle}
      />
      <div className="relative max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-3">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="flex items-center ml-15 md:ml-25" aria-label="Clipiro home">
            <ClipiroLogo className="h-9" />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            {/* Features mega-menu — full product surface, grouped. AI Tools has
                the most entries, so it spans two sub-columns to keep every
                column roughly the same height (no lopsided gap). */}
            <NavDropdown label="Features" width={940} align="screen">
              <div className="grid grid-cols-4 gap-0 p-3">
                <div className="p-2">
                  <p className="px-3 mb-1 text-[11px] font-bold uppercase tracking-widest text-brand-deep">Video Tools</p>
                  <div className="space-y-0.5">
                    {VIDEO_TOOLS.map((item) => (
                      <DropdownItem key={item.title} item={item} onNavigate={() => { }} />
                    ))}
                  </div>
                </div>
                <div className="col-span-2 p-2 border-l border-gray-100">
                  <p className="px-3 mb-1 text-[11px] font-bold uppercase tracking-widest text-brand-deep">AI Tools</p>
                  <div className="grid grid-cols-2 gap-x-1">
                    <div className="space-y-0.5">
                      {AI_TOOLS.slice(0, Math.ceil(AI_TOOLS.length / 2)).map((item) => (
                        <DropdownItem key={item.title} item={item} onNavigate={() => { }} />
                      ))}
                    </div>
                    <div className="space-y-0.5">
                      {AI_TOOLS.slice(Math.ceil(AI_TOOLS.length / 2)).map((item) => (
                        <DropdownItem key={item.title} item={item} onNavigate={() => { }} />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl bg-gradient-to-b from-brand/[0.04] to-transparent p-2 border-l border-gray-100">
                  <p className="px-3 mb-1 text-[11px] font-bold uppercase tracking-widest text-gray-400">Free Tools</p>
                  <div className="space-y-0.5">
                    {FREE_FEATURES.map((item) => (
                      <DropdownItem key={item.title} item={item} onNavigate={() => { }} />
                    ))}
                  </div>
                </div>
              </div>
            </NavDropdown>

            {/* Resources dropdown */}
            <NavDropdown label="Resources" width={340}>
              <div className="p-3 space-y-0.5">
                {RESOURCES.map((item) => (
                  <DropdownItem key={item.title} item={item} onNavigate={() => { }} />
                ))}
              </div>
            </NavDropdown>

            <Link href="/pricing" className="text-base font-semibold text-gray-700 hover:text-gray-900 transition-colors">Pricing</Link>
            <Link href="/blog" className="text-base font-semibold text-gray-700 hover:text-gray-900 transition-colors">Blog</Link>
            <Link href="/about" className="text-base font-semibold text-gray-700 hover:text-gray-900 transition-colors">About</Link>
          </nav>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <Link
                href="/dashboard"
                className="flex items-center gap-1.5 bg-brand text-white hover:bg-brand-dark text-base font-bold px-5 py-2.5 rounded-full transition-transform duration-200 hover:scale-[1.02]"
              >
                <ZapIcon className="w-3.5 h-3.5" />
                Dashboard
              </Link>
            ) : (
              <>
                <button
                  onClick={() => openAuthModal("login")}
                  className="text-base font-semibold text-gray-700 hover:text-gray-900 px-4 py-2.5 rounded-full transition-colors cursor-pointer"
                >
                  Sign In
                </button>
                <button
                  onClick={() => openAuthModal("register")}
                  className="flex items-center gap-1.5 bg-brand text-white hover:bg-brand-dark text-base font-bold px-5 py-2.5 rounded-full transition-transform duration-200 hover:scale-[1.02] cursor-pointer"
                >
                  <ZapIcon className="w-3.5 h-3.5" />
                  Start Free
                </button>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button className="md:hidden p-2 rounded-md text-gray-600 hover:text-gray-900" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden relative border-t border-gray-100 bg-white px-4 py-4 space-y-1">
          {/* Features */}
          <button onClick={() => setMobileSection(mobileSection === "features" ? null : "features")} className="flex items-center justify-between w-full text-sm font-semibold text-gray-700 py-2">
            Features
            <ChevronDownIcon className={`w-4 h-4 transition-transform ${mobileSection === "features" ? "rotate-180" : ""}`} />
          </button>
          {mobileSection === "features" && (
            <div className="pl-3 pb-1">
              {([["Video Tools", VIDEO_TOOLS], ["AI Tools", AI_TOOLS], ["Free Tools", FREE_FEATURES]] as const).map(([group, items]) => (
                <div key={group}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-brand-deep mt-2 mb-1">{group}</p>
                  {items.map((item) => (
                    <Link key={item.title} href={item.href} onClick={closeMobile} className="block py-1.5">
                      <span className="block text-sm font-medium text-gray-700 hover:text-brand-deep">{item.title}</span>
                      <span className="block text-xs text-gray-400">{item.desc}</span>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Resources */}
          <button onClick={() => setMobileSection(mobileSection === "resources" ? null : "resources")} className="flex items-center justify-between w-full text-sm font-semibold text-gray-700 py-2">
            Resources
            <ChevronDownIcon className={`w-4 h-4 transition-transform ${mobileSection === "resources" ? "rotate-180" : ""}`} />
          </button>
          {mobileSection === "resources" && (
            <div className="pl-3 pb-1">
              {RESOURCES.map((item) =>
                item.external ? (
                  <a key={item.title} href={item.href} target="_blank" rel="noopener noreferrer" onClick={closeMobile} className="block py-1.5">
                    <span className="block text-sm font-medium text-gray-700 hover:text-brand-deep">{item.title}</span>
                    <span className="block text-xs text-gray-400">{item.desc}</span>
                  </a>
                ) : (
                  <Link key={item.title} href={item.href} onClick={closeMobile} className="block py-1.5">
                    <span className="block text-sm font-medium text-gray-700 hover:text-brand-deep">{item.title}</span>
                    <span className="block text-xs text-gray-400">{item.desc}</span>
                  </Link>
                ),
              )}
            </div>
          )}

          <Link href="/pricing" className="block text-sm font-semibold text-gray-700 hover:text-brand-deep py-2" onClick={closeMobile}>Pricing</Link>
          <Link href="/blog" className="block text-sm font-semibold text-gray-700 hover:text-brand-deep py-2" onClick={closeMobile}>Blog</Link>
          <Link href="/about" className="block text-sm font-semibold text-gray-700 hover:text-brand-deep py-2" onClick={closeMobile}>About</Link>

          <div className="pt-2 border-t border-gray-100 mt-1 space-y-2">
            {user ? (
              <Link href="/dashboard" onClick={closeMobile} className="w-full flex items-center justify-center gap-1.5 bg-brand text-white hover:bg-brand-dark text-sm font-semibold px-4 py-2.5 rounded-full">
                <ZapIcon className="w-3.5 h-3.5" /> Dashboard
              </Link>
            ) : (
              <>
                <button onClick={() => { closeMobile(); openAuthModal("login"); }} className="w-full text-sm font-semibold text-gray-700 border border-gray-200 px-4 py-2.5 rounded-full">Sign In</button>
                <button onClick={() => { closeMobile(); openAuthModal("register"); }} className="w-full flex items-center justify-center gap-1.5 bg-brand text-white hover:bg-brand-dark text-sm font-semibold px-4 py-2.5 rounded-full">
                  <ZapIcon className="w-3.5 h-3.5" /> Start Free
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
