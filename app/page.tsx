"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";

// ── Icons ──────────────────────────────────────────────────────────────────
function ZapIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}
function ChevronDownIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function TwitterIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
function InstagramIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}
function DiscordIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}
function YoutubeIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 00.5 6.2 31 31 0 000 12a31 31 0 00.5 5.8 3 3 0 002.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 002.1-2.1A31 31 0 0024 12a31 31 0 00-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" />
    </svg>
  );
}
function TikTokIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.6 5.82A4.28 4.28 0 0115.54 3h-3.09v12.4a2.59 2.59 0 01-2.59 2.5 2.59 2.59 0 01-2.59-2.59 2.59 2.59 0 012.59-2.59c.27 0 .53.04.78.12V9.66a5.99 5.99 0 00-.78-.05A5.69 5.69 0 004.17 15.3a5.69 5.69 0 005.69 5.69 5.69 5.69 0 005.69-5.69V9.01a7.35 7.35 0 004.3 1.38V7.3a4.28 4.28 0 01-3.14-1.48z" />
    </svg>
  );
}

// ── Navbar ─────────────────────────────────────────────────────────────────
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

function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const { user, openAuthModal, signOut } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md">
      <div className={`absolute inset-0 transition-all duration-300 ${scrolled ? "bg-white/90 shadow-sm" : "bg-transparent"}`} />
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
            {user ? (
              <>
                <Link href="/dashboard" className="flex items-center gap-1.5 bg-[#335CFF] text-white text-sm font-bold px-5 py-2.5 rounded-full transition-transform duration-200 hover:scale-[1.01]">
                  Dashboard
                </Link>
                <button onClick={signOut} className="flex items-center gap-1.5 text-sm font-semibold text-[#525866] hover:text-gray-900 px-4 py-2.5 rounded-full border border-[#D7DBEA] hover:border-[#335CFF]/40 transition-colors cursor-pointer">
                  Logout
                </button>
              </>
            ) : (
              <button onClick={() => openAuthModal("register")} className="flex items-center gap-1.5 bg-[#335CFF] text-white text-sm font-bold px-5 py-2.5 rounded-full transition-transform duration-200 hover:scale-[1.01] cursor-pointer">
                <ZapIcon className="w-3.5 h-3.5" />
                Try Clipiro Now
              </button>
            )}
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
            {user ? (
              <>
                <Link href="/dashboard" className="block text-sm font-medium text-gray-700 hover:text-[#335CFF] py-2" onClick={() => setMenuOpen(false)}>Dashboard</Link>
                <button onClick={() => { signOut(); setMenuOpen(false); }} className="w-full text-left text-sm font-medium text-gray-500 hover:text-gray-800 py-2">Logout ({user.email})</button>
              </>
            ) : (
              <button onClick={() => { setMenuOpen(false); openAuthModal("register"); }} className="w-full flex items-center justify-center gap-1.5 bg-[#335CFF] text-white text-sm font-semibold px-4 py-2.5 rounded-full cursor-pointer mt-1">
                <ZapIcon className="w-3.5 h-3.5" />
                Try Clipiro Free
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

// ── Hero ───────────────────────────────────────────────────────────────────
function Hero() {
  const { user, openAuthModal } = useAuth();
  return (
    <section className="mx-auto flex w-full max-w-screen-2xl flex-col px-4 py-20 md:px-12 lg:px-[120px] lg:py-[120px] gap-6 lg:gap-8 text-center items-center">
      {/* Badge */}
      <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest text-[#335CFF] uppercase border border-[#335CFF]/20 bg-[#335CFF]/5 rounded-full px-4 py-1.5">
        3.2M+ USERS WORLDWIDE
      </span>

      {/* H1 */}
      <h1 className="text-[31px] md:text-balance md:text-7xl font-semibold text-gray-900 tracking-[0.015em] leading-tight">
        The #1 Clipping Tool
        <br />
        Edit Viral Videos With AI
      </h1>

      {/* Subtitle */}
      <p className="max-w-2xl text-lg text-gray-600 leading-relaxed">
        Your all-in-one tool for creating AI voiceovers, engaging subtitles, optimized gameplay, and more.
      </p>

      {/* Single CTA */}
      {user ? (
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 bg-[#335CFF] text-white font-semibold text-base px-8 py-4 rounded-full transition-transform duration-200 ease-in-out hover:scale-[1.01] shadow-[0px_1px_2px_rgba(14,18,27,0.24),0px_0px_0px_1px_#5B7CFF]"
        >
          <ZapIcon className="w-4 h-4" />
          Go to Dashboard
        </Link>
      ) : (
        <button
          onClick={() => openAuthModal("register")}
          className="inline-flex items-center gap-2 bg-[#335CFF] text-white font-semibold text-base px-8 py-4 rounded-full transition-transform duration-200 ease-in-out hover:scale-[1.01] cursor-pointer shadow-[0px_1px_2px_rgba(14,18,27,0.24),0px_0px_0px_1px_#5B7CFF]"
        >
          <ZapIcon className="w-4 h-4" />
          Try Clipiro Now
        </button>
      )}
    </section>
  );
}

// ── Workflows To Go Viral ──────────────────────────────────────────────────
function WorkflowsSection() {
  const { user, openAuthModal } = useAuth();

  return (
    <section className="mx-auto w-full max-w-screen-2xl flex flex-col gap-8 px-4 py-12 md:px-12 lg:px-[120px]">
      {/* Header row: title left, CTA right */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-[32px] md:text-[42px] font-bold leading-tight text-[#020617]">
            Workflows To Go Viral
          </h3>
          <p className="text-gray-500 text-sm mt-1">Example: See how to generate a streamer blurred clip</p>
        </div>
        {!user && (
          <button
            onClick={() => openAuthModal("register")}
            className="flex-shrink-0 inline-flex items-center gap-2 text-sm font-semibold text-white bg-[#335CFF] px-5 py-3 rounded-full hover:opacity-90 transition-opacity cursor-pointer shadow-[0px_1px_2px_rgba(14,18,27,0.24),0px_0px_0px_1px_#5B7CFF]"
          >
            <ZapIcon className="w-4 h-4" />
            Make an account
            <span className="text-base">›</span>
          </button>
        )}
        {user && (
          <Link
            href="/dashboard"
            className="flex-shrink-0 inline-flex items-center gap-2 text-sm font-semibold text-white bg-[#335CFF] px-5 py-3 rounded-full hover:opacity-90 transition-opacity shadow-[0px_1px_2px_rgba(14,18,27,0.24),0px_0px_0px_1px_#5B7CFF]"
          >
            <ZapIcon className="w-4 h-4" />
            Go to Dashboard
            <span className="text-base">›</span>
          </Link>
        )}
      </div>

      {/* 3 step cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Upload */}
        <div className="flex flex-col rounded-2xl border border-[#E8EDFF] bg-white overflow-hidden shadow-sm">
          <div className="relative bg-[#EEF2FF] h-52 flex items-center justify-center p-4">
            <div className="relative w-full h-full flex items-center justify-center">
              {/* Dashed upload area */}
              <div className="border-2 border-dashed border-[#335CFF]/40 rounded-xl w-44 h-32 flex flex-col items-center justify-center gap-2 bg-white/70">
                <svg className="w-8 h-8 text-[#335CFF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 12V4M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-xs text-gray-400 font-medium text-center px-2">Choose a clip or drag &amp; drop it here.</p>
                <span className="border border-gray-300 rounded-md px-3 py-1 text-xs text-gray-600 bg-white font-medium">Browse File</span>
              </div>
              {/* Video thumbnail overlay */}
              <div className="absolute right-3 top-2 w-14 h-20 rounded-lg bg-gray-800 overflow-hidden shadow-lg border-2 border-white flex items-end justify-center">
                <div className="w-full h-full bg-gradient-to-b from-gray-600 to-gray-900" />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 p-5">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-[#335CFF] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">1</div>
              <h2 className="text-base font-bold text-[#020617]">Upload your video</h2>
            </div>
            <p className="text-gray-500 text-sm pl-8">Use any file, or a YouTube/TikTok link.</p>
          </div>
        </div>

        {/* Card 2: Subtitle style */}
        <div className="flex flex-col rounded-2xl border border-[#E8EDFF] bg-white overflow-hidden shadow-sm">
          <div className="bg-[#EEF2FF] h-52 flex items-center justify-center p-4">
            <div className="grid grid-cols-3 gap-1.5 w-full">
              {[
                { text: "THE QUICK", color: "text-gray-700", bg: "bg-white", weight: "font-semibold" },
                { text: "FOX", color: "text-yellow-400", bg: "bg-[#1a1a2e]", weight: "font-black" },
                { text: "FOX", color: "text-green-400", bg: "bg-[#1a1a2e]", weight: "font-black" },
                { text: "QUICK", color: "text-gray-700", bg: "bg-white", weight: "font-semibold" },
                { text: "THE QUICK BROWN FOX", color: "text-[#335CFF]", bg: "bg-white", weight: "font-bold text-[8px]", border: true },
                { text: "THE QUICK BROWN FOX", color: "text-[#335CFF]", bg: "bg-white", weight: "font-semibold text-[7px]" },
                { text: "THE QUICK BROWN FOX", color: "text-yellow-400", bg: "bg-black", weight: "font-black text-[7px]" },
                { text: "THE QUICK BROWN FOX", color: "text-gray-600", bg: "bg-white", weight: "font-medium text-[7px]" },
                { text: "THE QUICK BROWN FOX", color: "text-pink-500", bg: "bg-white", weight: "font-black italic text-[7px]" },
              ].map((s, i) => (
                <div key={i} className={`${s.bg} rounded-md flex items-center justify-center h-9 px-1 ${s.border ? "border border-[#335CFF]/30" : ""}`}>
                  <span className={`${s.color} ${s.weight} text-center leading-tight`}>{s.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 p-5">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-[#335CFF] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">2</div>
              <h2 className="text-base font-bold text-[#020617]">Select Subtitle style</h2>
            </div>
            <p className="text-gray-500 text-sm pl-8">Choose from 15+ viral styles.</p>
          </div>
        </div>

        {/* Card 3: Generate */}
        <div className="flex flex-col rounded-2xl border border-[#E8EDFF] bg-white overflow-hidden shadow-sm">
          <div className="relative bg-[#EEF2FF] h-52 flex items-center justify-center p-4">
            <div className="relative flex items-center justify-center w-full h-full">
              {/* Spinner + text */}
              <div className="bg-white rounded-xl shadow-md flex flex-col items-center justify-center gap-2 w-36 h-24 z-10">
                <div className="relative w-12 h-12">
                  <svg className="w-12 h-12 text-[#335CFF]" viewBox="0 0 44 44" fill="none">
                    <circle cx="22" cy="22" r="18" stroke="#E8EDFF" strokeWidth="4" />
                    <path d="M22 4a18 18 0 0118 18" stroke="#335CFF" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                  <ZapIcon className="w-5 h-5 text-[#335CFF] absolute inset-0 m-auto" />
                </div>
                <p className="text-xs font-semibold text-gray-700">Generating Video...</p>
                <p className="text-[10px] text-gray-400">Hold on! It will take upto 30s</p>
              </div>
              {/* Video thumbnail overlay */}
              <div className="absolute right-3 top-2 w-14 h-20 rounded-lg bg-gray-800 overflow-hidden shadow-lg border-2 border-white">
                <div className="w-full h-full bg-gradient-to-b from-gray-600 to-gray-900" />
                <div className="absolute top-1 right-1 bg-yellow-400 rounded px-0.5 text-[8px] font-black text-black">FoX</div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 p-5">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-[#335CFF] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">3</div>
              <h2 className="text-base font-bold text-[#020617]">Generate Video</h2>
            </div>
            <p className="text-gray-500 text-sm pl-8">Watch it generate a video in seconds.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Editor Preview ─────────────────────────────────────────────────────────
function EditorPreviewSection() {
  const { user, openAuthModal } = useAuth();

  return (
    <section className="mx-auto w-full max-w-screen-2xl flex flex-col gap-10 px-4 py-12 md:px-12 lg:px-[120px]">
      {/* Heading row — label left, CTA right */}
      <div className="flex w-full flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-[#335CFF] uppercase tracking-widest">Web-Based Editor.</p>
          <h3 className="text-[32px] md:text-[42px] font-bold leading-tight text-[#020617]">
            Full control with our web editor.<br />
            Feels like magic.
          </h3>
        </div>
        {user ? (
          <Link href="/dashboard" className="flex-shrink-0 inline-flex items-center gap-2 text-sm font-semibold text-white bg-[#335CFF] px-5 py-3 rounded-full hover:opacity-90 transition-opacity shadow-[0px_1px_2px_rgba(14,18,27,0.24),0px_0px_0px_1px_#5B7CFF]">
            <ZapIcon className="w-4 h-4" /> Try Clipiro Now <span className="text-base">›</span>
          </Link>
        ) : (
          <button onClick={() => openAuthModal("register")} className="flex-shrink-0 inline-flex items-center gap-2 text-sm font-semibold text-white bg-[#335CFF] px-5 py-3 rounded-full hover:opacity-90 transition-opacity cursor-pointer shadow-[0px_1px_2px_rgba(14,18,27,0.24),0px_0px_0px_1px_#5B7CFF]">
            <ZapIcon className="w-4 h-4" /> Try Clipiro Now <span className="text-base">›</span>
          </button>
        )}
      </div>

      {/* Editor mockup — blue outer wrapper + bordered image */}
      <div className="flex w-full">
        <div className="w-full rounded-2xl bg-[#0052B4]/10 p-1 md:p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://cdn-crayo.com/lp/public/landing/editor.png"
            alt="Clipiro web editor"
            className="w-full rounded-2xl border border-[#6D9EFF]"
          />
        </div>
      </div>
    </section>
  );
}

// ── Everything You Need ────────────────────────────────────────────────────
function EverythingSection() {
  const { user, openAuthModal } = useAuth();

  const features = [
    { icon: "✂️", name: "Auto Clip", desc: "Automatically extract viral clips from long-form videos with AI." },
    { icon: "🎙️", name: "Voiceover Generator", desc: "120+ realistic AI voices with emotion and natural inflection." },
    { icon: "🖼️", name: "Image Generator", desc: "AI-generated images for thumbnails and video backgrounds." },
    { icon: "💬", name: "Subtitle Styles", desc: "15+ karaoke-style caption styles that keep viewers hooked." },
    { icon: "🎬", name: "Background Videos", desc: "Optimized gameplay footage and stock videos for any topic." },
    { icon: "📝", name: "Script Writer", desc: "AI-powered viral script generation in seconds." },
    { icon: "🎥", name: "Video Generator (VEO3)", desc: "Create cinematic AI videos from a text prompt." },
    { icon: "🔇", name: "Vocal Remover", desc: "Remove background noise and vocals instantly." },
  ];

  return (
    <section className="flex w-full items-center justify-center py-12">
      <div className="mx-auto w-full max-w-screen-2xl flex flex-col gap-10 px-4 md:px-12 lg:px-[120px]">
        {/* Heading + CTA row */}
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex flex-col gap-4 items-center">
            <h3 className="text-[38px] md:text-[45px] font-semibold leading-none text-[#020617]">
              Clipiro has everything you need to go viral
            </h3>
            <p className="text-gray-500 text-base max-w-xl">
              From cutting-edge speech enhancement to downloading videos, we&apos;ve got you covered.
            </p>
          </div>
          {user ? (
            <Link href="/dashboard" className="inline-flex items-center gap-2 bg-[#335CFF] text-white font-semibold text-sm px-6 py-3 rounded-full hover:scale-[1.01] transition-transform duration-200 shadow-[0px_1px_2px_rgba(14,18,27,0.24),0px_0px_0px_1px_#5B7CFF]">
              <ZapIcon className="w-3.5 h-3.5" />
              Try Clipiro Now
            </Link>
          ) : (
            <button onClick={() => openAuthModal("register")} className="inline-flex items-center gap-2 bg-[#335CFF] text-white font-semibold text-sm px-6 py-3 rounded-full hover:scale-[1.01] transition-transform duration-200 cursor-pointer shadow-[0px_1px_2px_rgba(14,18,27,0.24),0px_0px_0px_1px_#5B7CFF]">
              <ZapIcon className="w-3.5 h-3.5" />
              Try Clipiro Now
            </button>
          )}
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <div key={i} className="group/bento flex flex-col gap-3 overflow-hidden rounded-xl border border-[#EFF2FF] bg-white p-6 transition duration-200 hover:shadow-md">
              <div className="text-3xl">{f.icon}</div>
              <div>
                <h4 className="font-semibold text-[#020617] text-base mb-1">{f.name}</h4>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Testimonials ───────────────────────────────────────────────────────────
function Testimonials() {
  const { openAuthModal } = useAuth();

  const testimonials = [
    { name: "Musa", text: "I've clipped for some of the biggest creators on the internet. Clipiro is the tool I wish I had when I started." },
    { name: "Jonathan", text: "Clipiro is the only tool I've found that can remove backgrounds from videos well. 10/10." },
    { name: "Daniel", text: "After running channels with over 1 million subscribers, I built my workflow around Clipiro to solve scaling problems." },
    { name: "Dave", text: "Clipiro makes formatting and clipping content so much easier, now I can focus on finding the clips & trends." },
    { name: "Brandon", text: "Their image generator is insane. It saves me from needing multiple subscriptions for different AI models." },
    { name: "James", text: "I wish I found this sooner. Reddit story generations are OP for YouTube Shorts. Most worth it subscription I have." },
  ];

  return (
    <section className="mx-auto w-full max-w-screen-2xl flex flex-col items-center gap-10 px-4 py-12 md:px-12 lg:px-[120px] text-center">
      {/* Heading */}
      <h3 className="text-[38px] md:text-[48px] font-semibold leading-none text-[#020617]">
        Clipiro Has Generated Billions of Views.
        <br />
        For Millions of Clippers.
      </h3>

      {/* Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {testimonials.map((t, i) => (
          <div key={i} className="flex flex-col gap-4 rounded-xl border border-[#EFF2FF] p-6 shadow-sm bg-white">
            <p className="text-gray-700 text-sm leading-relaxed">&ldquo;{t.text}&rdquo;</p>
            <p className="font-semibold text-[#020617] text-sm">{t.name}</p>
          </div>
        ))}
      </div>

      {/* Make an account CTA */}
      <div className="flex justify-center">
        <button
          onClick={() => openAuthModal("register")}
          className="inline-flex items-center gap-2 bg-[#335CFF] text-white font-semibold text-sm px-6 py-3 rounded-full hover:scale-[1.01] transition-transform duration-200 cursor-pointer shadow-[0px_1px_2px_rgba(14,18,27,0.24),0px_0px_0px_1px_#5B7CFF]"
        >
          Make an account
        </button>
      </div>
    </section>
  );
}

// ── Founder Section ────────────────────────────────────────────────────────
function FounderSection() {
  return (
    <section className="mx-auto w-full max-w-screen-2xl flex flex-col items-center gap-8 px-4 py-12 md:px-12 lg:px-[120px] text-center">
      <p className="text-sm font-semibold text-gray-500 uppercase tracking-widest">Meet our Founder</p>

      {/* Avatar */}
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#335CFF] to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
        D
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xl font-bold text-[#020617]">Divyansh Verma</p>
        <p className="text-gray-500 text-sm">Founder of Clipiro</p>
      </div>

      <blockquote className="max-w-xl text-[#020617] text-lg font-medium leading-relaxed">
        &ldquo;I&apos;ve gone viral on multiple platforms and studied what makes content explode. I built Clipiro to make going viral easy for anyone — no editing experience required.&rdquo;
      </blockquote>

      {/* Platform badges */}
      <div className="flex items-center gap-3 text-gray-400 text-xs font-semibold uppercase tracking-wider">
        <span>Edited for</span>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center text-white">
            <YoutubeIcon className="w-4 h-4" />
          </div>
          <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center text-white">
            <TikTokIcon className="w-4 h-4" />
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white">
            <InstagramIcon className="w-4 h-4" />
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Pricing ────────────────────────────────────────────────────────────────
function Pricing() {
  const { user, openAuthModal } = useAuth();
  const plans = [
    {
      name: "Starter",
      price: "₹799",
      credits: 60,
      features: ["60 video credits", "All AI voices", "Karaoke captions", "720p export", "Email support"],
      cta: "Get Started",
      highlighted: false,
    },
    {
      name: "Pro",
      price: "₹1,599",
      credits: 180,
      features: ["180 video credits", "All AI voices", "Karaoke captions", "1080p export", "Priority support", "Background music library"],
      cta: "Go Pro",
      highlighted: true,
    },
    {
      name: "Studio",
      price: "₹3,999",
      credits: 600,
      features: ["600 video credits", "All AI voices", "Karaoke captions", "4K export", "Dedicated support", "Background music library", "Team collaboration", "API access"],
      cta: "Get Studio",
      highlighted: false,
    },
  ];

  return (
    <section id="pricing" className="mx-auto w-full max-w-screen-2xl flex flex-col gap-10 px-4 py-12 md:px-12 lg:px-[120px]">
      <div className="text-center flex flex-col gap-3">
        <span className="text-[#335CFF] font-semibold text-sm uppercase tracking-widest">Pricing</span>
        <h2 className="text-[38px] md:text-[45px] font-semibold leading-none text-[#020617]">
          Simple, transparent pricing
        </h2>
        <p className="text-gray-500 text-base">
          Buy credits once, use them forever. No subscription traps.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8 items-start">
        {plans.map((plan, i) => (
          <div
            key={i}
            className={`rounded-xl p-8 border-2 ${plan.highlighted ? "border-[#335CFF] bg-[#335CFF] text-white shadow-2xl scale-105" : "border-[#D7DBEA] bg-white text-gray-900"}`}
          >
            {plan.highlighted && (
              <div className="text-center mb-4">
                <span className="bg-white text-[#335CFF] text-xs font-bold px-3 py-1 rounded-full">Most Popular</span>
              </div>
            )}
            <div className="mb-6">
              <div className={`text-sm font-bold uppercase tracking-wide mb-1 ${plan.highlighted ? "text-blue-200" : "text-[#868C98]"}`}>{plan.name}</div>
              <div className="flex items-end gap-1">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className={`text-sm mb-1 ${plan.highlighted ? "text-blue-200" : "text-[#868C98]"}`}>one-time</span>
              </div>
              <div className={`text-sm mt-1 ${plan.highlighted ? "text-blue-200" : "text-[#868C98]"}`}>{plan.credits} video credits</div>
            </div>
            <ul className="space-y-3 mb-8">
              {plan.features.map((feat, j) => (
                <li key={j} className="flex items-center gap-2.5 text-sm">
                  <CheckIcon className={`w-4 h-4 flex-shrink-0 ${plan.highlighted ? "text-blue-200" : "text-[#335CFF]"}`} />
                  <span className={plan.highlighted ? "text-blue-100" : "text-[#525866]"}>{feat}</span>
                </li>
              ))}
            </ul>
            {user ? (
              <Link href="/billing" className={`block text-center font-bold py-3 rounded-full transition-all ${plan.highlighted ? "bg-white text-[#335CFF] hover:bg-[#F9FBFF]" : "bg-[#335CFF] text-white hover:opacity-90"}`}>
                {plan.cta}
              </Link>
            ) : (
              <button onClick={() => openAuthModal("login")} className={`w-full block text-center font-bold py-3 rounded-full transition-all cursor-pointer ${plan.highlighted ? "bg-white text-[#335CFF] hover:bg-[#F9FBFF]" : "bg-[#335CFF] text-white hover:opacity-90"}`}>
                {plan.cta}
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="text-center text-gray-500 text-sm">All plans include 30 free credits to start. No credit card required.</p>
    </section>
  );
}

// ── FAQ ────────────────────────────────────────────────────────────────────
const FAQS = [
  { q: "Can I cancel my plan?", a: "Yes, you can cancel at any time from your account settings. Since Clipiro uses a credit-based model, your remaining credits stay in your account even after cancellation." },
  { q: "What is a workflow credit?", a: "A workflow credit is used each time you generate a video using one of Clipiro's AI workflows — such as Reddit Story Video, Split Screen, or Streamer Video. One credit = one generated video." },
  { q: "How long is a VEO3 video?", a: "VEO3 videos generated through Clipiro are typically 5–8 seconds long per generation, optimized for use as background clips or standalone AI content." },
  { q: "Is VEO3 free?", a: "VEO3 generation uses workflow credits. You get 30 free credits when you sign up, which can be used for VEO3 or any other workflow." },
  { q: "How do I view my usage?", a: "You can view your credit usage and remaining balance in your Clipiro dashboard under Account → Credits." },
  { q: "Do you have a refund policy?", a: "Yes. If you're unsatisfied with your purchase, contact support within 7 days and we'll review your case. See our full refund policy for details." },
  { q: "What is an export minute?", a: "Export minutes refer to the total duration of videos you export. Each plan includes a set number of export minutes per month in addition to workflow credits." },
  { q: "Can I monetize videos created with Clipiro?", a: "Yes. You own the rights to every video you create with Clipiro. All AI voices and background music are licensed for commercial use, including YouTube monetization." },
  { q: "Can I generate in other languages?", a: "Yes. Clipiro supports voiceover generation in 30+ languages. Simply select your preferred language and voice in the workflow settings." },
  { q: "Can I import images from ChatGPT to Clipiro?", a: "Yes. You can upload any image (including those generated by ChatGPT or DALL-E) and use it as a background or overlay in your Clipiro video workflows." },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="mx-auto w-full max-w-screen-2xl flex flex-col gap-10 px-4 py-12 md:px-12 lg:px-[120px]">
      {/* Heading — centered */}
      <h3 className="text-center text-[35px] font-semibold md:text-[45px] text-[#020617]">Frequently asked questions</h3>

      {/* Inner flex: grid + still-have-questions */}
      <div className="flex w-full flex-col gap-6 items-center justify-center md:gap-16">
        {/* 2-column FAQ grid */}
        <div className="grid w-full grid-cols-1 gap-[22px] md:grid-cols-2">
          {FAQS.map((faq, i) => (
            <div key={i} className="align-start w-full items-start max-h-fit rounded-2xl border border-[#EFF2FF] bg-white px-[30px] py-2 shadow-sm">
              <button
                className="group flex w-full items-center justify-between py-4 text-left text-sm font-semibold text-[#020617] transition-all"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span className="pr-4 text-[15px] font-semibold text-[#020617]">{faq.q}</span>
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#525866] flex items-center justify-center text-white transition-transform duration-200" style={{ transform: open === i ? 'rotate(45deg)' : 'none' }}>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                </div>
              </button>
              {open === i && (
                <div className="pb-4 text-sm text-[#525866] leading-relaxed">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Still have questions */}
        <div className="flex w-full flex-col items-start justify-between gap-5 rounded-2xl border border-[#CACFD8] bg-[#F9FBFF] px-4 py-6 sm:px-[40px] sm:py-[30px] md:flex-row md:items-center md:gap-0">
          <div className="flex flex-col gap-1">
            <h4 className="text-lg font-bold text-[#020617]">Still have questions?</h4>
            <p className="text-sm text-[#525866]">Contact our 24/7 support team for any concerns or inquiries.</p>
          </div>
          <a
            href="mailto:support@clipiro.ai"
            className="flex-shrink-0 inline-flex items-center justify-center gap-2 rounded-full bg-[#3860FF] px-6 py-2.5 text-sm font-semibold text-white transition duration-200 ease-in-out hover:opacity-90"
          >
            Get in touch
          </a>
        </div>
      </div>
    </section>
  );
}

// ── Still Have Questions — now merged into FAQ above ───────────────────────
function StillHaveQuestions() {
  return null;
}

// ── CTA Banner ─────────────────────────────────────────────────────────────
function CTABanner() {
  const { user, openAuthModal } = useAuth();
  return (
    <section className="mx-auto w-full max-w-screen-2xl flex flex-col items-center gap-6 px-4 py-16 md:px-12 lg:px-[120px] text-center">
      <h2 className="text-[38px] md:text-[56px] font-semibold leading-none text-[#020617]">
        Feels like magic.
      </h2>
      {user ? (
        <Link href="/dashboard" className="inline-flex items-center gap-2 bg-[#335CFF] text-white font-semibold text-base px-8 py-4 rounded-full hover:scale-[1.01] transition-transform duration-200 shadow-[0px_1px_2px_rgba(14,18,27,0.24),0px_0px_0px_1px_#5B7CFF]">
          <ZapIcon className="w-4 h-4" />
          Try Clipiro Now
        </Link>
      ) : (
        <button onClick={() => openAuthModal("register")} className="inline-flex items-center gap-2 bg-[#335CFF] text-white font-semibold text-base px-8 py-4 rounded-full hover:scale-[1.01] transition-transform duration-200 cursor-pointer shadow-[0px_1px_2px_rgba(14,18,27,0.24),0px_0px_0px_1px_#5B7CFF]">
          <ZapIcon className="w-4 h-4" />
          Try Clipiro Now
        </button>
      )}
    </section>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────
function Footer() {
  const columns = [
    {
      title: "Workflows",
      links: [
        { label: "Classic Split Screen", href: "/dashboard/create/split-video" },
        { label: "Vertical Split Screen", href: "/dashboard/create/viral-split-screen" },
        { label: "Reddit Story Video", href: "/dashboard/create/reddit-video" },
        { label: "Fake Texts Video", href: "/dashboard/create/text-video" },
        { label: "Streamer Video", href: "/dashboard/create/streamer-video" },
      ],
    },
    {
      title: "AI Tools",
      links: [
        { label: "Voiceover Generator", href: "/dashboard/tools/voiceover" },
        { label: "Image Generator", href: "/dashboard/tools/image-generator" },
        { label: "Video Generator (VEO3)", href: "/dashboard/tools" },
        { label: "Vocal Remover", href: "/dashboard/tools" },
        { label: "Video & Image Background Remover", href: "/dashboard/tools" },
      ],
    },
    {
      title: "Free Tools",
      links: [
        { label: "Audio Balancer", href: "/dashboard/tools/free/audio-balancer" },
        { label: "Video Compressor", href: "/dashboard/tools/free/video-compressor" },
        { label: "MP3 Converter", href: "/dashboard/tools/free/mp3-converter" },
      ],
    },
    {
      title: "Product",
      links: [
        { label: "Pricing", href: "/pricing" },
        { label: "Enterprise", href: "/pricing" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Refund policy", href: "/refund" },
        { label: "Terms of service", href: "/terms" },
        { label: "Privacy policy", href: "/privacy" },
        { label: "Affiliate TOS", href: "/affiliate-tos" },
      ],
    },
  ];

  const socials = [
    { icon: <TwitterIcon className="w-4 h-4" />, label: "X (Twitter)", href: "#" },
    { icon: <InstagramIcon className="w-4 h-4" />, label: "Instagram", href: "#" },
    { icon: <DiscordIcon className="w-4 h-4" />, label: "Discord", href: "#" },
  ];

  return (
    <footer className="bg-[#335CFF] px-4 sm:px-6 lg:px-8 py-10 mt-8">
      <div className="mx-auto max-w-screen-2xl rounded-3xl border border-[#E0E5EA] bg-white px-10 pt-10 pb-8">
        {/* 5-column link grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8 mb-10">
          {columns.map((col) => (
            <div key={col.title}>
              <div className="text-gray-900 font-bold text-sm mb-4">{col.title}</div>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom row */}
        <div className="flex items-center justify-between pt-6 border-t border-gray-100">
          <Link href="/" className="flex items-center gap-2 font-black text-2xl text-gray-900 tracking-tight">
            <span className="bg-[#335CFF] text-white rounded-lg w-8 h-8 flex items-center justify-center">
              <ZapIcon className="w-4 h-4" />
            </span>
            CLIPIRO
          </Link>
          <div className="flex items-center gap-2">
            {socials.map((s) => (
              <a key={s.label} href={s.href} aria-label={s.label} className="w-9 h-9 rounded-full bg-[#335CFF] hover:opacity-90 text-white flex items-center justify-center transition-colors">
                {s.icon}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <Hero />
      <WorkflowsSection />
      <EditorPreviewSection />
      <EverythingSection />
      <Testimonials />
      <FounderSection />
      <FAQ />
      <StillHaveQuestions />
      <Footer />
    </div>
  );
}
