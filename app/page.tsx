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
function StarIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
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


// ── Navbar ─────────────────────────────────────────────────────────────────
const FEATURES_ITEMS = [
  {
    title: "Reddit Story Videos",
    desc: "Create reddit-style story videos in seconds with our AI script generator",
    href: "/dashboard/create/reddit-video",
  },
  {
    title: "Split Screen Videos",
    desc: "Create split-screen video with our AI script generator",
    href: "/dashboard/create/viral-split-screen",
  },
  {
    title: "Fake Text Stories",
    desc: "Create fake text conversation videos for Instagram, TikTok, and Shorts",
    href: "/dashboard/create/text-video",
  },
  {
    title: "Veo-3 Style Video",
    desc: "Create viral Veo-3 style videos with just a few clicks",
    href: "/dashboard/create/streamer-video",
  },
];

const TOOLS_ITEMS = [
  { title: "Audio Balancer",   href: "/dashboard/tools/free/audio-balancer"  },
  { title: "Video Compressor", href: "/dashboard/tools/free/video-compressor" },
  { title: "MP3 Converter",    href: "/dashboard/tools/free/mp3-converter"   },
];

const RESOURCES_ITEMS = [
  {
    title: "Affiliate Program",
    desc: "Earn 20% on all paid referrals to ClipForge.",
    href: "/affiliate-tos",
  },
  {
    title: "Community Discord",
    desc: "Join for customer support and feedback.",
    href: "/discord",
  },
];

function NavDropdown({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
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
  const { user, openAuthModal, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-extrabold text-xl text-gray-900">
            <span className="bg-blue-600 text-white rounded-lg w-8 h-8 flex items-center justify-center">
              <ZapIcon className="w-4 h-4" />
            </span>
            ClipForge
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-7">

            {/* Features dropdown */}
            <NavDropdown label="Features">
              <div className="flex gap-0 p-2" style={{ minWidth: 560 }}>
                {/* Left — feature pages */}
                <div className="flex-1 p-3 space-y-1">
                  {FEATURES_ITEMS.map(item => (
                    <Link key={item.href} href={item.href}
                      className="flex flex-col gap-0.5 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors group">
                      <span className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{item.title}</span>
                      <span className="text-xs text-gray-500 leading-snug">{item.desc}</span>
                    </Link>
                  ))}
                </div>
                {/* Divider */}
                <div className="w-px bg-gray-100 my-2" />
                {/* Right — free tools */}
                <div className="w-44 p-5 space-y-3">
                  {TOOLS_ITEMS.map(item => (
                    <Link key={item.href} href={item.href}
                      className="block text-sm font-semibold text-gray-800 hover:text-blue-600 transition-colors">
                      {item.title}
                    </Link>
                  ))}
                </div>
              </div>
            </NavDropdown>

            {/* Resources dropdown */}
            <NavDropdown label="Resources">
              <div className="flex gap-6 p-6" style={{ minWidth: 440 }}>
                {RESOURCES_ITEMS.map(item => (
                  <Link key={item.href} href={item.href}
                    className="flex flex-col gap-1 flex-1 hover:opacity-80 transition-opacity group">
                    <span className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{item.title}</span>
                    <span className="text-xs text-gray-500 leading-snug">{item.desc}</span>
                  </Link>
                ))}
              </div>
            </NavDropdown>

            <Link href="/blog" className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors">Blog</Link>
            <Link href="/pricing" className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors">Pricing</Link>
          </nav>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <Link href="/dashboard" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                  Dashboard
                </Link>
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold select-none">
                  {user.email[0].toUpperCase()}
                </div>
                <button onClick={signOut} className="text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors">
                  Logout
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => openAuthModal("login")}
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors bg-transparent border-none cursor-pointer"
                >
                  Sign in
                </button>
                <button
                  onClick={() => openAuthModal("register")}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors shadow-sm cursor-pointer"
                >
                  <ZapIcon className="w-3.5 h-3.5" />
                  Try ClipForge Free
                </button>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-md text-gray-600 hover:text-gray-900"
            onClick={() => setMenuOpen(!menuOpen)}
          >
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
          {/* Features section */}
          <button
            onClick={() => setMobileSection(mobileSection === "features" ? null : "features")}
            className="flex items-center justify-between w-full text-sm font-semibold text-gray-700 py-2"
          >
            Features
            <svg className={`w-4 h-4 transition-transform ${mobileSection === "features" ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {mobileSection === "features" && (
            <div className="pl-3 space-y-1 pb-1">
              {[...FEATURES_ITEMS, ...TOOLS_ITEMS].map(item => (
                <Link key={item.href} href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="block text-sm text-gray-600 hover:text-blue-600 py-1.5">
                  {"desc" in item ? item.title : item.title}
                </Link>
              ))}
            </div>
          )}

          {/* Resources section */}
          <button
            onClick={() => setMobileSection(mobileSection === "resources" ? null : "resources")}
            className="flex items-center justify-between w-full text-sm font-semibold text-gray-700 py-2"
          >
            Resources
            <svg className={`w-4 h-4 transition-transform ${mobileSection === "resources" ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {mobileSection === "resources" && (
            <div className="pl-3 space-y-1 pb-1">
              {RESOURCES_ITEMS.map(item => (
                <Link key={item.href} href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="block text-sm text-gray-600 hover:text-blue-600 py-1.5">
                  {item.title}
                </Link>
              ))}
            </div>
          )}

          <Link href="/blog" className="block text-sm font-semibold text-gray-700 hover:text-blue-600 py-2" onClick={() => setMenuOpen(false)}>Blog</Link>
          <Link href="/pricing" className="block text-sm font-semibold text-gray-700 hover:text-blue-600 py-2" onClick={() => setMenuOpen(false)}>Pricing</Link>

          <div className="pt-2 border-t border-gray-100 mt-1">
            {user ? (
              <>
                <Link href="/dashboard" className="block text-sm font-medium text-gray-700 hover:text-blue-600 py-2" onClick={() => setMenuOpen(false)}>
                  Dashboard
                </Link>
                <button onClick={() => { signOut(); setMenuOpen(false); }} className="w-full text-left text-sm font-medium text-gray-500 hover:text-gray-800 py-2">
                  Logout ({user.email})
                </button>
              </>
            ) : (
              <button
                onClick={() => { setMenuOpen(false); openAuthModal("register"); }}
                className="w-full flex items-center justify-center gap-1.5 bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-full cursor-pointer mt-1"
              >
                <ZapIcon className="w-3.5 h-3.5" />
                Try ClipForge Free
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
    <section className="relative overflow-hidden bg-white pt-20 pb-24">
      {/* Background gradient blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -left-32 w-[600px] h-[600px] bg-blue-100 rounded-full opacity-40 blur-3xl" />
        <div className="absolute -top-12 right-0 w-[400px] h-[400px] bg-purple-100 rounded-full opacity-30 blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold px-4 py-1.5 rounded-full mb-6">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          #1 AI Faceless Video Generator
        </div>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-gray-900 leading-tight tracking-tight mb-6">
          Create Viral Videos
          <br />
          <span className="text-blue-600">With AI</span> — In Seconds
        </h1>

        <p className="max-w-2xl mx-auto text-lg sm:text-xl text-gray-500 mb-10 leading-relaxed">
          Generate scripts, voiceovers, captions, and full-length short-form videos with one click.
          No editing skills required — just a topic.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
          {user ? (
            <Link
              href="/dashboard"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg px-8 py-4 rounded-full shadow-lg transition-transform hover:scale-105 animate-pulse"
            >
              <ZapIcon className="w-5 h-5" />
              Go to Dashboard
            </Link>
          ) : (
            <button
              onClick={() => openAuthModal("register")}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg px-8 py-4 rounded-full shadow-lg transition-transform hover:scale-105 cursor-pointer"
            >
              <ZapIcon className="w-5 h-5" />
              Start Creating Free
            </button>
          )}
          <Link
            href="#features"
            className="flex items-center gap-2 text-gray-700 font-semibold text-base px-6 py-4 rounded-full border border-gray-200 hover:border-blue-300 hover:text-blue-600 transition-colors"
          >
            See how it works
          </Link>
        </div>


        {/* Social proof */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {["bg-blue-400", "bg-purple-400", "bg-pink-400", "bg-green-400", "bg-orange-400"].map((color, i) => (
                <div key={i} className={`w-8 h-8 rounded-full ${color} border-2 border-white flex items-center justify-center text-white text-xs font-bold`}>
                  {String.fromCharCode(65 + i)}
                </div>
              ))}
            </div>
            <span><strong className="text-gray-800">3.2M+</strong> creators</span>
          </div>
          <span className="hidden sm:block text-gray-300">|</span>
          <div className="flex items-center gap-1">
            {[1,2,3,4,5].map(i => <StarIcon key={i} className="w-4 h-4 text-yellow-400" />)}
            <span className="ml-1"><strong className="text-gray-800">4.9/5</strong> rating</span>
          </div>
          <span className="hidden sm:block text-gray-300">|</span>
          <span>No credit card required</span>
        </div>

        {/* Hero preview card */}
        <div className="mt-16 relative max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl overflow-hidden border border-gray-700 p-1">
            <div className="bg-gray-900 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="ml-3 text-gray-500 text-xs">ClipForge AI Editor</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 bg-gray-800 rounded-lg p-4 space-y-3">
                  <div className="h-3 bg-blue-600 rounded-full w-3/4" />
                  <div className="h-2 bg-gray-700 rounded-full w-full" />
                  <div className="h-2 bg-gray-700 rounded-full w-5/6" />
                  <div className="h-2 bg-gray-700 rounded-full w-4/6" />
                  <div className="mt-4 flex gap-2">
                    <div className="h-8 bg-blue-600 rounded-lg flex-1 flex items-center justify-center">
                      <span className="text-white text-xs font-medium">Generate Video</span>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-800 rounded-lg overflow-hidden flex items-center justify-center">
                  <div className="w-20 h-36 bg-gradient-to-b from-blue-600 to-purple-700 rounded-lg flex flex-col items-center justify-end pb-3 gap-1">
                    <div className="w-14 h-2 bg-white/30 rounded-full" />
                    <div className="w-10 h-2 bg-white/20 rounded-full" />
                    <div className="w-12 h-2 bg-white/40 rounded-full" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Floating badges */}
          <div className="absolute -left-6 top-1/3 bg-white rounded-xl shadow-xl border border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-800 flex items-center gap-2">
            <span className="text-green-500 font-bold text-base">✓</span> Script generated
          </div>
          <div className="absolute -right-6 top-1/2 bg-white rounded-xl shadow-xl border border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-800 flex items-center gap-2">
            <ZapIcon className="w-4 h-4 text-blue-600" /> 12s render
          </div>
        </div>
      </div>
    </section>
  );
}

// ── How It Works ───────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Enter Your Topic",
      description: "Type any topic or paste your script. Our AI instantly generates a viral-ready script tailored for short-form content.",
      icon: "💡",
      color: "from-blue-500 to-blue-600",
    },
    {
      number: "02",
      title: "Customize Your Video",
      description: "Choose your AI voice, background, music, and caption style. Hundreds of combinations to match your brand.",
      icon: "🎨",
      color: "from-purple-500 to-purple-600",
    },
    {
      number: "03",
      title: "Export & Go Viral",
      description: "Download your 9:16 vertical video in seconds, ready to post on TikTok, YouTube Shorts, or Instagram Reels.",
      icon: "🚀",
      color: "from-pink-500 to-rose-600",
    },
  ];

  return (
    <section id="features" className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-blue-600 font-semibold text-sm uppercase tracking-widest">How It Works</span>
          <h2 className="mt-3 text-4xl sm:text-5xl font-extrabold text-gray-900">
            From idea to viral video
            <br />in <span className="text-blue-600">3 simple steps</span>
          </h2>
          <p className="mt-4 text-gray-500 text-lg max-w-xl mx-auto">
            No timeline. No editing. No experience needed. Just results.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <div key={i} className="relative bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center text-2xl mb-6 shadow-lg`}>
                {step.icon}
              </div>
              <div className="text-6xl font-black text-gray-100 absolute top-6 right-8 leading-none">{step.number}</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{step.title}</h3>
              <p className="text-gray-500 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Tools Grid ────────────────────────────────────────────────────────────
function ToolsGrid() {
  const tools = [
    { icon: "🎙️", name: "AI Voiceover", desc: "120+ realistic AI voices with emotion and inflection", badge: "Popular" },
    { icon: "📝", name: "Script Writer", desc: "Gemini-powered viral script generation in seconds", badge: "New" },
    { icon: "💬", name: "Karaoke Captions", desc: "Word-by-word highlighted captions that keep viewers hooked", badge: "" },
    { icon: "🎵", name: "Background Music", desc: "Royalty-free music library synced to your video", badge: "" },
    { icon: "🖼️", name: "AI Backgrounds", desc: "Stunning stock videos and AI visuals for any topic", badge: "" },
    { icon: "✂️", name: "Auto Editing", desc: "AI cuts, trims, and assembles your video automatically", badge: "Beta" },
    { icon: "📤", name: "Direct Export", desc: "9:16 vertical videos optimized for every platform", badge: "" },
    { icon: "📊", name: "Analytics Ready", desc: "Built for retention: hooks, pacing, and CTA built in", badge: "" },
  ];

  return (
    <section id="tools" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-blue-600 font-semibold text-sm uppercase tracking-widest">AI Toolkit</span>
          <h2 className="mt-3 text-4xl sm:text-5xl font-extrabold text-gray-900">
            Everything you need to
            <br /><span className="text-blue-600">dominate short-form</span>
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {tools.map((tool, i) => (
            <div
              key={i}
              className="group relative bg-gray-50 hover:bg-blue-50 border border-gray-100 hover:border-blue-200 rounded-2xl p-6 transition-all duration-200 cursor-pointer"
            >
              {tool.badge && (
                <span className="absolute top-4 right-4 text-xs font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full">
                  {tool.badge}
                </span>
              )}
              <div className="text-3xl mb-4">{tool.icon}</div>
              <h3 className="font-bold text-gray-900 mb-1.5 group-hover:text-blue-700 transition-colors">{tool.name}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{tool.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Stats Banner ───────────────────────────────────────────────────────────
function StatsBanner() {
  const stats = [
    { value: "3.2M+", label: "Creators" },
    { value: "50B+", label: "Views Generated" },
    { value: "12M+", label: "Videos Created" },
    { value: "4.9★", label: "Average Rating" },
  ];

  return (
    <section className="py-20 bg-gradient-to-r from-blue-600 to-blue-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
            Generating Billions of Views
          </h2>
          <p className="mt-3 text-blue-200 text-lg">
            Join the fastest-growing community of faceless creators
          </p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <div key={i} className="text-center">
              <div className="text-5xl font-black text-white mb-2">{stat.value}</div>
              <div className="text-blue-200 font-medium">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Testimonials ───────────────────────────────────────────────────────────
function Testimonials() {
  const testimonials = [
    {
      name: "Arjun Sharma",
      handle: "@arjunclips",
      avatar: "AS",
      color: "bg-blue-500",
      text: "ClipForge helped me go from 0 to 200K followers in 3 months. The AI script + karaoke captions combo is unreal.",
      platform: "TikTok",
      views: "18M views",
    },
    {
      name: "Priya Mehta",
      handle: "@priyafinance",
      avatar: "PM",
      color: "bg-purple-500",
      text: "I run a faceless finance channel. ClipForge creates my entire week of content in under 30 minutes. Absolutely wild.",
      platform: "YouTube Shorts",
      views: "42M views",
    },
    {
      name: "Rohit Kumar",
      handle: "@rohitmotivates",
      avatar: "RK",
      color: "bg-green-500",
      text: "The voiceovers sound so natural my audience didn't believe it was AI. Monetised my channel in 2 months.",
      platform: "Instagram Reels",
      views: "9M views",
    },
    {
      name: "Sakshi Patel",
      handle: "@sakshitech",
      avatar: "SP",
      color: "bg-pink-500",
      text: "Tried every tool out there. ClipForge is the only one where the final video actually looks professional without any editing.",
      platform: "TikTok",
      views: "31M views",
    },
    {
      name: "Vikram Nair",
      handle: "@vikramnews",
      avatar: "VN",
      color: "bg-orange-500",
      text: "I post 2 videos daily using ClipForge. The script quality is better than what I was writing manually. 10/10.",
      platform: "YouTube Shorts",
      views: "65M views",
    },
    {
      name: "Ananya Singh",
      handle: "@ananyalifestyle",
      avatar: "AN",
      color: "bg-teal-500",
      text: "ClipForge saved my channel. I was burning out creating content — now the AI does it for me and my views tripled.",
      platform: "Instagram Reels",
      views: "22M views",
    },
  ];

  return (
    <section className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-blue-600 font-semibold text-sm uppercase tracking-widest">Creator Stories</span>
          <h2 className="mt-3 text-4xl sm:text-5xl font-extrabold text-gray-900">
            Creators love ClipForge
          </h2>
          <p className="mt-4 text-gray-500 text-lg">
            Real results from real creators — not actors
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full ${t.color} flex items-center justify-center text-white font-bold text-sm`}>
                    {t.avatar}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">{t.name}</div>
                    <div className="text-gray-400 text-xs">{t.handle}</div>
                  </div>
                </div>
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map(s => <StarIcon key={s} className="w-3.5 h-3.5 text-yellow-400" />)}
                </div>
              </div>
              <p className="text-gray-700 text-sm leading-relaxed mb-4">&ldquo;{t.text}&rdquo;</p>
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <span className="text-xs text-gray-400 font-medium">{t.platform}</span>
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{t.views}</span>
              </div>
            </div>
          ))}
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
      features: [
        "60 video credits",
        "All AI voices",
        "Karaoke captions",
        "720p export",
        "Email support",
      ],
      cta: "Get Started",
      highlighted: false,
    },
    {
      name: "Pro",
      price: "₹1,599",
      credits: 180,
      features: [
        "180 video credits",
        "All AI voices",
        "Karaoke captions",
        "1080p export",
        "Priority support",
        "Background music library",
      ],
      cta: "Go Pro",
      highlighted: true,
    },
    {
      name: "Studio",
      price: "₹3,999",
      credits: 600,
      features: [
        "600 video credits",
        "All AI voices",
        "Karaoke captions",
        "4K export",
        "Dedicated support",
        "Background music library",
        "Team collaboration",
        "API access",
      ],
      cta: "Get Studio",
      highlighted: false,
    },
  ];

  return (
    <section id="pricing" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-blue-600 font-semibold text-sm uppercase tracking-widest">Pricing</span>
          <h2 className="mt-3 text-4xl sm:text-5xl font-extrabold text-gray-900">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-gray-500 text-lg">
            Buy credits once, use them forever. No subscription traps.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 items-start">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={`rounded-2xl p-8 border-2 ${
                plan.highlighted
                  ? "border-blue-600 bg-blue-600 text-white shadow-2xl scale-105"
                  : "border-gray-100 bg-gray-50 text-gray-900"
              }`}
            >
              {plan.highlighted && (
                <div className="text-center mb-4">
                  <span className="bg-white text-blue-600 text-xs font-bold px-3 py-1 rounded-full">Most Popular</span>
                </div>
              )}
              <div className="mb-6">
                <div className={`text-sm font-bold uppercase tracking-wide mb-1 ${plan.highlighted ? "text-blue-200" : "text-gray-500"}`}>
                  {plan.name}
                </div>
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-black">{plan.price}</span>
                  <span className={`text-sm mb-1 ${plan.highlighted ? "text-blue-200" : "text-gray-400"}`}>one-time</span>
                </div>
                <div className={`text-sm mt-1 ${plan.highlighted ? "text-blue-200" : "text-gray-500"}`}>
                  {plan.credits} video credits
                </div>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feat, j) => (
                  <li key={j} className="flex items-center gap-2.5 text-sm">
                    <CheckIcon className={`w-4 h-4 flex-shrink-0 ${plan.highlighted ? "text-blue-200" : "text-blue-600"}`} />
                    <span className={plan.highlighted ? "text-blue-100" : "text-gray-700"}>{feat}</span>
                  </li>
                ))}
              </ul>

              {user ? (
                <Link
                  href="/billing"
                  className={`block text-center font-bold py-3 rounded-full transition-all ${
                    plan.highlighted
                      ? "bg-white text-blue-600 hover:bg-blue-50"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {plan.cta}
                </Link>
              ) : (
                <button
                  onClick={() => openAuthModal("login")}
                  className={`w-full block text-center font-bold py-3 rounded-full transition-all cursor-pointer ${
                    plan.highlighted
                      ? "bg-white text-blue-600 hover:bg-blue-50"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {plan.cta}
                </button>
              )}

            </div>
          ))}
        </div>

        <p className="text-center mt-8 text-gray-400 text-sm">
          All plans include 30 free credits to start. No credit card required.
        </p>
      </div>
    </section>
  );
}

// ── FAQ ────────────────────────────────────────────────────────────────────
const FAQS = [
  {
    q: "What is ClipForge?",
    a: "ClipForge is an AI-powered faceless video generator. It writes your script, generates a voiceover, adds karaoke captions, syncs background music, and renders a ready-to-post vertical video — all from a single text prompt.",
  },
  {
    q: "Do I need any video editing experience?",
    a: "None at all. ClipForge handles everything automatically. Just enter a topic, pick your preferences, and hit generate. The AI does the rest.",
  },
  {
    q: "How many videos can I create?",
    a: "Each account starts with 30 free credits. Each credit generates one video. Purchase credit packs — Starter (60), Pro (180), or Studio (600) — to create more.",
  },
  {
    q: "What platforms are the videos optimized for?",
    a: "All videos export in 9:16 vertical format (1080×1920), optimized for TikTok, YouTube Shorts, and Instagram Reels.",
  },
  {
    q: "Can I use the videos commercially?",
    a: "Yes. You own the rights to every video you create with ClipForge. All AI voices and background music are licensed for commercial use.",
  },
  {
    q: "How long does it take to generate a video?",
    a: "Most videos render in 15–60 seconds depending on length and queue size. You can monitor progress in your dashboard in real time.",
  },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="py-24 bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <span className="text-blue-600 font-semibold text-sm uppercase tracking-widest">FAQ</span>
          <h2 className="mt-3 text-4xl font-extrabold text-gray-900">Frequently asked questions</h2>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <div
              key={i}
              className={`bg-white border rounded-xl overflow-hidden transition-all ${
                open === i ? "border-blue-200 shadow-sm" : "border-gray-100"
              }`}
            >
              <button
                className="w-full flex items-center justify-between px-6 py-5 text-left"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span className="font-semibold text-gray-900">{faq.q}</span>
                <ChevronDownIcon
                  className={`w-5 h-5 text-gray-400 flex-shrink-0 ml-4 transition-transform ${open === i ? "rotate-180" : ""}`}
                />
              </button>
              {open === i && (
                <div className="px-6 pb-5 text-gray-600 leading-relaxed text-sm border-t border-gray-100 pt-4">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── CTA Banner ─────────────────────────────────────────────────────────────
function CTABanner() {
  const { user, openAuthModal } = useAuth();
  return (
    <section className="py-24 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-12 sm:p-16 text-white shadow-2xl">
          <h2 className="text-4xl sm:text-5xl font-extrabold mb-4">
            Ready to go viral?
          </h2>
          <p className="text-blue-200 text-lg mb-8 max-w-xl mx-auto">
            Join 3.2 million creators using ClipForge to build faceless channels that print views.
          </p>
          {user ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 bg-white text-blue-600 font-bold text-lg px-8 py-4 rounded-full hover:bg-blue-50 transition-colors shadow-lg"
            >
              <ZapIcon className="w-5 h-5" />
              Go to Dashboard
            </Link>
          ) : (
            <button
              onClick={() => openAuthModal("register")}
              className="inline-flex items-center gap-2 bg-white text-blue-600 font-bold text-lg px-8 py-4 rounded-full hover:bg-blue-50 transition-colors shadow-lg cursor-pointer"
            >
              <ZapIcon className="w-5 h-5" />
              Start for Free — 30 Credits Included
            </button>
          )}

          <p className="mt-4 text-blue-300 text-sm">No credit card required</p>
        </div>
      </div>
    </section>
  );
}

// ── Discord icon ───────────────────────────────────────────────────────────
function DiscordIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

// ── Still Have Questions ───────────────────────────────────────────────────
function StillHaveQuestions() {
  return (
    <section className="bg-white px-4 sm:px-6 lg:px-8 pb-0 pt-0">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border border-gray-200 rounded-2xl px-8 py-6">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Still have questions?</h3>
            <p className="text-sm text-gray-500 mt-0.5">Contact our 24/7 support team for any concerns or inquiries.</p>
          </div>
          <a
            href="mailto:support@clipforge.ai"
            className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-6 py-2.5 rounded-full transition-colors"
          >
            Get in touch
          </a>
        </div>
      </div>
    </section>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────
function Footer() {
  const columns = [
    {
      title: "Workflows",
      links: [
        { label: "Classic Split Screen", highlight: false, href: "/dashboard/create/split-video" },
        { label: "Vertical Split Screen", highlight: false, href: "/dashboard/create/viral-split-screen" },
        { label: "Reddit Story Video", highlight: true },
        { label: "Fake Texts Video", highlight: true },
        { label: "Streamer Video", highlight: false, href: "/dashboard/create/streamer-video" },
      ],
    },
    {
      title: "AI Tools",
      links: [
        { label: "Voiceover Generator", highlight: true },
        { label: "Image Generator", highlight: true },
        { label: "Video Generator (VEO3)", highlight: true },
        { label: "Vocal Remover", highlight: false },
        { label: "Video & Image Background Remover", highlight: false },
      ],
    },
    {
      title: "Free Tools",
      links: [
        { label: "Audio Balancer", highlight: false, href: "/dashboard/tools/free/audio-balancer" },
        { label: "Video Compressor", highlight: false, href: "/dashboard/tools/free/video-compressor" },
        { label: "MP3 Converter", highlight: false, href: "/dashboard/tools/free/mp3-converter" },
      ],
    },
    {
      title: "Product",
      links: [
        { label: "Pricing", highlight: true, href: "/pricing" },
        { label: "Enterprise", highlight: true },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Refund policy", highlight: false, href: "/refund" },
        { label: "Terms of service", highlight: false, href: "/terms" },
        { label: "Privacy policy", highlight: false, href: "/privacy" },
        { label: "Affiliate TOS", highlight: false, href: "/affiliate-tos" },
      ],
    },
  ];

  const socials = [
    { icon: <TwitterIcon className="w-4 h-4" />, label: "X (Twitter)" },
    { icon: <InstagramIcon className="w-4 h-4" />, label: "Instagram" },
    { icon: <DiscordIcon className="w-4 h-4" />, label: "Discord" },
  ];

  return (
    <footer className="bg-blue-600 px-4 sm:px-6 lg:px-8 pt-10 pb-10 mt-16">
      <div className="max-w-7xl mx-auto">
        {/* White rounded card */}
        <div className="bg-white rounded-3xl px-10 pt-10 pb-8">
          {/* 5-column link grid — always single row */}
          <div className="grid grid-cols-5 gap-6 mb-10">
            {columns.map((col) => (
              <div key={col.title}>
                <div className="text-gray-900 font-bold text-sm mb-4">{col.title}</div>
                <ul className="space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href || "#"}
                        className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Bottom row: logo left, social icons right */}
          <div className="flex items-center justify-between pt-6 border-t border-gray-100">
            <Link href="/" className="flex items-center gap-2 font-black text-2xl text-gray-900 tracking-tight">
              <span className="bg-blue-600 text-white rounded-lg w-8 h-8 flex items-center justify-center">
                <ZapIcon className="w-4 h-4" />
              </span>
              CLIPFORGE
            </Link>

            <div className="flex items-center gap-2">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href="#"
                  aria-label={s.label}
                  className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors"
                >
                  {s.icon}
                </a>
              ))}
            </div>
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
      <HowItWorks />
      <ToolsGrid />
      <StatsBanner />
      <Testimonials />
      <Pricing />
      <FAQ />
      <StillHaveQuestions />
      <CTABanner />
      <Footer />
    </div>
  );
}
