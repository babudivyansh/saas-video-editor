"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import { ZapIcon, ChevronDownIcon } from "@/app/components/landing/icons";

type NavItem = { title: string; desc: string; href: string; external?: boolean };

// ── Real product features ────────────────────────────────────────────────────
// Free features map to the live free tools / downloaders; premium features map
// to the gated AI workflows & tools (the auth modal gates them on click).
const FREE_FEATURES: NavItem[] = [
  { title: "Audio Balancer", desc: "Balance the left & right audio channels", href: "/dashboard/tools/free/audio-balancer" },
  { title: "Video Compressor", desc: "Shrink video file size without quality loss", href: "/dashboard/tools/free/video-compressor" },
  { title: "MP3 Converter", desc: "Convert any media file to MP3", href: "/dashboard/tools/free/mp3-converter" },
  { title: "YouTube Downloader", desc: "Download YouTube videos in a click", href: "/dashboard/tools/youtube-downloader" },
  { title: "Instagram Downloader", desc: "Save Instagram reels & posts instantly", href: "/dashboard/tools/instagram-downloader" },
];

const PREMIUM_FEATURES: NavItem[] = [
  { title: "AI Auto Clip", desc: "Turn long videos into viral shorts automatically", href: "/dashboard/create/auto-clip" },
  { title: "Reddit Story Videos", desc: "AI-scripted Reddit-style story videos", href: "/dashboard/create/reddit-video" },
  { title: "Viral Split Screen", desc: "Gameplay split-screen videos that retain viewers", href: "/dashboard/create/viral-split-screen" },
  { title: "Fake Text Videos", desc: "Create fake text-conversation story videos", href: "/dashboard/create/text-video" },
  { title: "AI Voiceover", desc: "50+ realistic narrators across 29+ languages", href: "/dashboard/tools/voiceover" },
  { title: "Veo3 AI Video", desc: "Generate AI video clips with Google Veo3", href: "/dashboard/tools/video-generator" },
];

const RESOURCES: NavItem[] = [
  { title: "Affiliate Program", desc: "Earn 20% recurring on every paid referral", href: "/dashboard/referral" },
  { title: "Community Discord", desc: "Get support & connect with fellow creators", href: "https://discord.gg/clipiro", external: true },
];

// Renders a dropdown row (title + description), handling internal vs external links.
function DropdownItem({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const className =
    "flex flex-col gap-0.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-gray-50 group";
  const content = (
    <>
      <span className="text-sm font-semibold text-gray-900 group-hover:text-[#335CFF] transition-colors">{item.title}</span>
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

// Generic click-outside dropdown shell.
function NavDropdown({ label, children, width }: { label: string; children: React.ReactNode; width: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"
      >
        {label}
        <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-3 rounded-2xl border border-gray-100 bg-white shadow-xl z-50"
          style={{ width }}
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

  const bgClass = solid || scrolled ? "bg-white/90 shadow-sm" : "bg-transparent";
  const closeMobile = () => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md font-sans">
      <div className={`absolute inset-0 transition-all duration-300 ${bgClass}`} />
      <div className="relative max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-black text-2xl tracking-tight text-gray-900">
            <span className="bg-[#335CFF] text-white rounded-lg w-8 h-8 flex items-center justify-center">
              <ZapIcon className="w-4 h-4" />
            </span>
            CLIPIRO
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            {/* Features mega-menu */}
            <NavDropdown label="Features" width={640}>
              <div className="grid grid-cols-2 gap-0 p-3">
                <div className="p-2">
                  <p className="px-3 mb-1 text-[11px] font-bold uppercase tracking-widest text-gray-400">Free Features</p>
                  <div className="space-y-0.5">
                    {FREE_FEATURES.map((item) => (
                      <DropdownItem key={item.title} item={item} onNavigate={() => {}} />
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl bg-gradient-to-b from-[#335CFF]/[0.04] to-transparent p-2">
                  <p className="px-3 mb-1 text-[11px] font-bold uppercase tracking-widest text-[#335CFF]">Premium Features</p>
                  <div className="space-y-0.5">
                    {PREMIUM_FEATURES.map((item) => (
                      <DropdownItem key={item.title} item={item} onNavigate={() => {}} />
                    ))}
                  </div>
                </div>
              </div>
            </NavDropdown>

            {/* Resources dropdown */}
            <NavDropdown label="Resources" width={340}>
              <div className="p-3 space-y-0.5">
                {RESOURCES.map((item) => (
                  <DropdownItem key={item.title} item={item} onNavigate={() => {}} />
                ))}
              </div>
            </NavDropdown>

            <Link href="/pricing" className="text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors">Pricing</Link>
            <Link href="/blog" className="text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors">Blog</Link>
            <Link href="/about" className="text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors">About</Link>
          </nav>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <Link
                href="/dashboard"
                className="flex items-center gap-1.5 bg-[#335CFF] text-white text-sm font-bold px-5 py-2.5 rounded-full transition-transform duration-200 hover:scale-[1.02]"
              >
                <ZapIcon className="w-3.5 h-3.5" />
                Dashboard
              </Link>
            ) : (
              <>
                <button
                  onClick={() => openAuthModal("login")}
                  className="text-sm font-semibold text-gray-700 hover:text-gray-900 px-4 py-2.5 rounded-full transition-colors cursor-pointer"
                >
                  Sign In
                </button>
                <button
                  onClick={() => openAuthModal("register")}
                  className="flex items-center gap-1.5 bg-[#335CFF] text-white text-sm font-bold px-5 py-2.5 rounded-full transition-transform duration-200 hover:scale-[1.02] cursor-pointer"
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
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-1 mb-1">Free</p>
              {FREE_FEATURES.map((item) => (
                <Link key={item.title} href={item.href} onClick={closeMobile} className="block py-1.5">
                  <span className="block text-sm font-medium text-gray-700 hover:text-[#335CFF]">{item.title}</span>
                  <span className="block text-xs text-gray-400">{item.desc}</span>
                </Link>
              ))}
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#335CFF] mt-2 mb-1">Premium</p>
              {PREMIUM_FEATURES.map((item) => (
                <Link key={item.title} href={item.href} onClick={closeMobile} className="block py-1.5">
                  <span className="block text-sm font-medium text-gray-700 hover:text-[#335CFF]">{item.title}</span>
                  <span className="block text-xs text-gray-400">{item.desc}</span>
                </Link>
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
                    <span className="block text-sm font-medium text-gray-700 hover:text-[#335CFF]">{item.title}</span>
                    <span className="block text-xs text-gray-400">{item.desc}</span>
                  </a>
                ) : (
                  <Link key={item.title} href={item.href} onClick={closeMobile} className="block py-1.5">
                    <span className="block text-sm font-medium text-gray-700 hover:text-[#335CFF]">{item.title}</span>
                    <span className="block text-xs text-gray-400">{item.desc}</span>
                  </Link>
                ),
              )}
            </div>
          )}

          <Link href="/pricing" className="block text-sm font-semibold text-gray-700 hover:text-[#335CFF] py-2" onClick={closeMobile}>Pricing</Link>
          <Link href="/blog" className="block text-sm font-semibold text-gray-700 hover:text-[#335CFF] py-2" onClick={closeMobile}>Blog</Link>
          <Link href="/about" className="block text-sm font-semibold text-gray-700 hover:text-[#335CFF] py-2" onClick={closeMobile}>About</Link>

          <div className="pt-2 border-t border-gray-100 mt-1 space-y-2">
            {user ? (
              <Link href="/dashboard" onClick={closeMobile} className="w-full flex items-center justify-center gap-1.5 bg-[#335CFF] text-white text-sm font-semibold px-4 py-2.5 rounded-full">
                <ZapIcon className="w-3.5 h-3.5" /> Dashboard
              </Link>
            ) : (
              <>
                <button onClick={() => { closeMobile(); openAuthModal("login"); }} className="w-full text-sm font-semibold text-gray-700 border border-gray-200 px-4 py-2.5 rounded-full">Sign In</button>
                <button onClick={() => { closeMobile(); openAuthModal("register"); }} className="w-full flex items-center justify-center gap-1.5 bg-[#335CFF] text-white text-sm font-semibold px-4 py-2.5 rounded-full">
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
