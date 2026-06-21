"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";

function ZapIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

const FEATURES_ITEMS = [
  { title: "Reddit Story Videos", desc: "Create reddit-style story videos in seconds with our AI script generator", href: "/dashboard/create/reddit-video" },
  { title: "Split Screen Videos", desc: "Create split-screen video with our AI script generator", href: "/dashboard/create/viral-split-screen" },
  { title: "Fake Text Stories", desc: "Create fake text conversation videos for Instagram, TikTok, and Shorts", href: "/dashboard/create/text-video" },
  { title: "Veo-3 Style Video", desc: "Create viral Veo-3 style videos with just a few clicks", href: "/dashboard/create/streamer-video" },
];

const TOOLS_ITEMS = [
  { title: "Audio Balancer", href: "/dashboard/tools/free/audio-balancer" },
  { title: "Video Compressor", href: "/dashboard/tools/free/video-compressor" },
  { title: "MP3 Converter", href: "/dashboard/tools/free/mp3-converter" },
];

const RESOURCES_ITEMS = [
  { title: "Affiliate Program", desc: "Earn 20% on all paid referrals to Clipiro.", href: "/affiliate-tos" },
  { title: "Community Discord", desc: "Join for customer support and feedback.", href: "/discord" },
];

function NavDropdown({ label, children }: { label: string; children: React.ReactNode }) {
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
        onClick={() => setOpen(prev => !prev)}
        className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
      >
        {label}
        <svg className={`w-3.5 h-3.5 transition-transform duration-150 ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 min-w-max">
          {children}
        </div>
      )}
    </div>
  );
}

// Shared marketing/public navbar. Used by the home, pricing, billing, and legal
// pages so a logo/auth-state change in one place flows everywhere.
//
// `solid` forces the white background regardless of scroll position — use on
// pages that don't sit over a hero image (pricing/legal/billing).
export default function SiteNavbar({ solid = false }: { solid?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const { openAuthModal } = useAuth();

  useEffect(() => {
    if (solid) return;
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [solid]);

  const bgClass = solid || scrolled ? "bg-white/90 shadow-sm" : "bg-transparent";

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md">
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
            <NavDropdown label="Features">
              <div className="flex gap-0 p-2" style={{ minWidth: 560 }}>
                <div className="flex-1 p-3 space-y-1">
                  {FEATURES_ITEMS.map(item => (
                    <Link key={item.href} href={item.href}
                      className="flex flex-col gap-0.5 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors group">
                      <span className="text-sm font-semibold text-gray-900 group-hover:text-[#335CFF] transition-colors">{item.title}</span>
                      <span className="text-xs text-gray-500 leading-snug">{item.desc}</span>
                    </Link>
                  ))}
                </div>
                <div className="w-px bg-gray-100 my-2" />
                <div className="w-44 p-5 space-y-3">
                  {TOOLS_ITEMS.map(item => (
                    <Link key={item.href} href={item.href}
                      className="block text-sm font-semibold text-gray-800 hover:text-[#335CFF] transition-colors">
                      {item.title}
                    </Link>
                  ))}
                </div>
              </div>
            </NavDropdown>

            <NavDropdown label="Resources">
              <div className="flex gap-6 p-6" style={{ minWidth: 440 }}>
                {RESOURCES_ITEMS.map(item => (
                  <Link key={item.href} href={item.href}
                    className="flex flex-col gap-1 flex-1 hover:opacity-80 transition-opacity group">
                    <span className="text-sm font-semibold text-gray-900 group-hover:text-[#335CFF] transition-colors">{item.title}</span>
                    <span className="text-xs text-gray-500 leading-snug">{item.desc}</span>
                  </Link>
                ))}
              </div>
            </NavDropdown>

            <Link href="/blog" className="text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors">Blog</Link>
            <Link href="/pricing" className="text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors">Pricing</Link>
          </nav>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <button onClick={() => openAuthModal("register")} className="flex items-center gap-1.5 bg-[#335CFF] text-white text-sm font-bold px-5 py-2.5 rounded-full transition-transform duration-200 hover:scale-[1.01] cursor-pointer">
              <ZapIcon className="w-3.5 h-3.5" />
              Try Clipiro Now
            </button>
          </div>

          {/* Mobile hamburger */}
          <button className="md:hidden p-2 rounded-md text-gray-600 hover:text-gray-900" onClick={() => setMenuOpen(!menuOpen)}>
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
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-4 space-y-1">
          <button onClick={() => setMobileSection(mobileSection === "features" ? null : "features")} className="flex items-center justify-between w-full text-sm font-semibold text-gray-700 py-2">
            Features
            <svg className={`w-4 h-4 transition-transform ${mobileSection === "features" ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {mobileSection === "features" && (
            <div className="pl-3 space-y-1 pb-1">
              {[...FEATURES_ITEMS, ...TOOLS_ITEMS].map(item => (
                <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} className="block text-sm text-gray-600 hover:text-[#335CFF] py-1.5">
                  {item.title}
                </Link>
              ))}
            </div>
          )}
          <button onClick={() => setMobileSection(mobileSection === "resources" ? null : "resources")} className="flex items-center justify-between w-full text-sm font-semibold text-gray-700 py-2">
            Resources
            <svg className={`w-4 h-4 transition-transform ${mobileSection === "resources" ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {mobileSection === "resources" && (
            <div className="pl-3 space-y-1 pb-1">
              {RESOURCES_ITEMS.map(item => (
                <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} className="block text-sm text-gray-600 hover:text-[#335CFF] py-1.5">
                  {item.title}
                </Link>
              ))}
            </div>
          )}
          <Link href="/blog" className="block text-sm font-semibold text-gray-700 hover:text-[#335CFF] py-2" onClick={() => setMenuOpen(false)}>Blog</Link>
          <Link href="/pricing" className="block text-sm font-semibold text-gray-700 hover:text-[#335CFF] py-2" onClick={() => setMenuOpen(false)}>Pricing</Link>
          <div className="pt-2 border-t border-gray-100 mt-1">
            <button onClick={() => { setMenuOpen(false); openAuthModal("register"); }} className="w-full flex items-center justify-center gap-1.5 bg-[#335CFF] text-white text-sm font-semibold px-4 py-2.5 rounded-full cursor-pointer mt-1">
              <ZapIcon className="w-3.5 h-3.5" />
              Try Clipiro Free
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
