"use client";

// Full-width dashboard header, shared across every dashboard page via
// app/dashboard/layout.tsx. Left: logo + Resources/Features mega-menus
// (featureLinks.ts, same data as the marketing navbar). Center: global
// search over every tool/page. Right: Create menu, plan chip, credits
// pill, Upgrade/Top Up, and the account avatar.
//
// Height must stay h-16 — NavDropdown's align="screen" mega-menu is pinned
// at fixed top-[72px] and misaligns if the header grows.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ClipiroLogo from "@/app/components/ClipiroLogo";
import { NavDropdown, DropdownItem, type NavItem } from "@/app/components/NavDropdown";
import SidebarAccount from "@/app/components/SidebarAccount";
import { useAuth } from "@/app/components/AuthContext";
import { FREE_FEATURES, VIDEO_TOOLS, AI_TOOLS, RESOURCES } from "@/app/components/featureLinks";
import { Button } from "@/app/components/ui/Button";
import { CreditsPill } from "@/app/components/ui/CreditsPill";

function IcZap() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>;
}
function IcSearch() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>;
}
function IcPlus() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4"><path d="M12 5v14M5 12h14"/></svg>;
}
function IcChevronDown({ open }: { open: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6"/></svg>;
}
function IcGift() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>;
}
function IcDiscord() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>;
}

/** Letter avatar for tool rows — strips the "AI " prefix so initials vary. */
function LetterChip({ title, className }: { title: string; className: string }) {
  return (
    <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${className}`}>
      {title.replace(/^AI /, "")[0]}
    </span>
  );
}

const TOOL_COUNT = VIDEO_TOOLS.length + AI_TOOLS.length + FREE_FEATURES.length;

// Same two links as featureLinks.ts's RESOURCES, except Affiliate Program
// points at the user's own affiliate dashboard (/dashboard/referral) instead
// of the public marketing page — this header only appears once logged in.
const DASHBOARD_RESOURCES: NavItem[] = [
  { title: "Affiliate Program", desc: "Earn 20% recurring on every paid referral", href: "/dashboard/referral" },
  RESOURCES[1], // Community Discord — unchanged, still goes through /discord
];

// ── Global search ──────────────────────────────────────────────────────────

interface SearchEntry extends NavItem {
  group: string;
}

const CORE_PAGES: SearchEntry[] = [
  { title: "Dashboard Home", desc: "Overview, quests & quick start", href: "/dashboard", group: "Page" },
  { title: "My Clips", desc: "All your AutoClip projects", href: "/dashboard/clips", group: "Page" },
  { title: "Assets", desc: "Your uploaded media library", href: "/dashboard/assets", group: "Page" },
  { title: "Social Tracker", desc: "Track your social performance", href: "/dashboard/social-tracker", group: "Page" },
  { title: "Earn Credits", desc: "Referral & affiliate dashboard", href: "/dashboard/referral", group: "Page" },
  { title: "Billing & Plans", desc: "Upgrade or top up credits", href: "/billing", group: "Page" },
  { title: "My Account", desc: "Profile & personal info", href: "/dashboard/profile/personal-info", group: "Page" },
];

const SEARCH_INDEX: SearchEntry[] = [
  ...VIDEO_TOOLS.map((t) => ({ ...t, group: "Video" })),
  ...AI_TOOLS.map((t) => ({ ...t, group: "AI" })),
  ...FREE_FEATURES.map((t) => ({ ...t, group: "Free" })),
  ...CORE_PAGES,
];

function HeaderSearch() {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setFocused(false);
    }
    if (focused) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [focused]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SEARCH_INDEX.filter(
      (e) => e.title.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q)
    ).slice(0, 7);
  }, [query]);

  const open = focused && results.length > 0;

  return (
    <div ref={ref} className="relative hidden md:block flex-1 max-w-md">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft/50 pointer-events-none"><IcSearch /></span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={(e) => { if (e.key === "Escape") setFocused(false); }}
        placeholder="Search tools & pages…"
        className="w-full text-sm bg-surface border border-card-border rounded-full pl-10 pr-4 py-2 text-ink placeholder:text-ink-soft/50 outline-none focus:bg-white focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all"
      />
      <div
        className={`absolute top-full mt-2 left-0 right-0 rounded-2xl border border-card-border bg-white shadow-xl z-50 overflow-hidden origin-top transition-all duration-150 ease-out ${
          open ? "opacity-100 scale-100 visible" : "opacity-0 scale-95 invisible pointer-events-none"
        }`}
      >
        <div className="py-1.5">
          {results.map((r) => (
            <Link
              key={r.href + r.title}
              href={r.href}
              onClick={() => { setQuery(""); setFocused(false); }}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-tint-blue transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink group-hover:text-brand transition-colors truncate">{r.title}</p>
                <p className="text-xs text-ink-soft truncate">{r.desc}</p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent-violet bg-tint-violet rounded-full px-2 py-0.5 flex-shrink-0">{r.group}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Create menu ────────────────────────────────────────────────────────────

const CREATE_ITEMS: NavItem[] = [
  { title: "Clipiro AutoClip", desc: "Long video → viral clips, automatically", href: "/dashboard/create/auto-clip" },
  { title: "Video Editor", desc: "Multi-track timeline editor", href: "/dashboard/editor" },
  { title: "Cut & Crop", desc: "Trim & stitch clips ready to edit", href: "/dashboard/cut-and-crop" },
  { title: "AI Creator", desc: "Become an AI creator in 3 steps", href: "/dashboard/ai-creator" },
  { title: "Reddit Story Video", desc: "Turn Reddit posts into videos", href: "/dashboard/create/reddit-video" },
  { title: "Fake Texts Video", desc: "Text-conversation story videos", href: "/dashboard/create/text-video" },
];

function CreateMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        onClick={() => setOpen((p) => !p)}
        className="inline-flex items-center gap-1.5 grad-brand text-white text-sm font-semibold px-4 py-2 rounded-full shadow-glow hover:shadow-glow-hover hover:brightness-105 transition-all cursor-pointer"
      >
        <IcPlus /> Create <IcChevronDown open={open} />
      </button>
      <div
        className={`absolute top-full mt-2 right-0 w-72 rounded-2xl border border-card-border bg-white shadow-xl z-50 overflow-hidden origin-top-right transition-all duration-150 ease-out ${
          open ? "opacity-100 scale-100 visible" : "opacity-0 scale-95 invisible pointer-events-none"
        }`}
      >
        <div className="p-2 space-y-0.5" onClick={() => setOpen(false)}>
          {CREATE_ITEMS.map((item) => (
            <DropdownItem key={item.title} item={item} onNavigate={() => setOpen(false)} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────

export default function DashboardHeader() {
  const { user, openAuthModal } = useAuth();

  const hasActivePlan =
    !!user?.subscriptionEndsAt && new Date(user.subscriptionEndsAt) > new Date();
  const planName = hasActivePlan ? user?.plan?.name ?? "Pro" : "Free";

  return (
    <header className="flex items-center gap-4 px-5 h-16 flex-shrink-0 border-b border-gray-100 bg-white z-40">
      <Link href="/dashboard" className="flex items-center flex-shrink-0" aria-label="Dashboard home">
        <ClipiroLogo className="h-8" />
      </Link>

      <nav className="hidden lg:flex items-center gap-1 flex-shrink-0">
        <NavDropdown label="Resources" width={340}>
          <div className="p-3 space-y-1">
            <DropdownItem
              item={DASHBOARD_RESOURCES[0]}
              onNavigate={() => {}}
              chip={<span className="w-8 h-8 rounded-lg bg-tint-emerald text-emerald-600 flex items-center justify-center flex-shrink-0"><IcGift /></span>}
            />
            <DropdownItem
              item={DASHBOARD_RESOURCES[1]}
              onNavigate={() => {}}
              chip={<span className="w-8 h-8 rounded-lg bg-[#5865F2]/10 text-[#5865F2] flex items-center justify-center flex-shrink-0"><IcDiscord /></span>}
            />
          </div>
          <div className="border-t border-gray-100 bg-surface px-4 py-2.5">
            <p className="text-xs text-ink-soft">Questions? The Discord community is the fastest way to get help.</p>
          </div>
        </NavDropdown>

        {/* Compact, anchored under the trigger — the tools catalog page is
            the full browsing surface; this is just a shortcut menu. */}
        <NavDropdown label="Features" width={620} align="left">
          <div className="grid grid-cols-2 gap-0 p-3">
            {/* Video tools */}
            <div className="p-2">
              <p className="px-3 mb-1 text-[11px] font-bold uppercase tracking-widest text-brand">Video Tools</p>
              <div className="space-y-0.5">
                {VIDEO_TOOLS.slice(0, 4).map((item) => (
                  <DropdownItem key={item.title} item={item} onNavigate={() => {}}
                    chip={<LetterChip title={item.title} className="bg-tint-blue text-brand" />} />
                ))}
              </div>
            </div>
            {/* AI tools */}
            <div className="p-2 border-l border-gray-100">
              <p className="px-3 mb-1 text-[11px] font-bold uppercase tracking-widest text-accent-violet">AI Tools</p>
              <div className="space-y-0.5">
                {AI_TOOLS.slice(0, 4).map((item) => (
                  <DropdownItem key={item.title} item={item} onNavigate={() => {}}
                    chip={<LetterChip title={item.title} className="bg-tint-violet text-accent-violet" />} />
                ))}
              </div>
            </div>
            {/* Free tools */}
            <div className="p-2 border-t border-gray-100">
              <p className="px-3 mb-1 text-[11px] font-bold uppercase tracking-widest text-accent-fuchsia">Free Tools</p>
              <div className="space-y-0.5">
                {FREE_FEATURES.slice(0, 3).map((item) => (
                  <DropdownItem key={item.title} item={item} onNavigate={() => {}}
                    chip={<LetterChip title={item.title} className="bg-tint-fuchsia text-accent-fuchsia" />} />
                ))}
              </div>
            </div>
            {/* Mini spotlight */}
            <div className="relative overflow-hidden rounded-2xl grad-hero p-4 flex flex-col text-white m-2 border-t border-transparent">
              <div className="clipiro-blob absolute -top-10 -right-8 w-28 h-28 rounded-full bg-white/15 blur-2xl pointer-events-none" />
              <p className="relative text-[10px] font-bold uppercase tracking-widest text-white/70 mb-1">Spotlight</p>
              <p className="relative text-sm font-extrabold leading-tight">Clipiro AutoClip</p>
              <p className="relative text-xs text-white/80 mt-1 leading-relaxed">Long videos into viral clips, automatically.</p>
              <Link href="/dashboard/create/auto-clip" className="relative mt-auto pt-2.5 inline-block">
                <span className="inline-flex items-center gap-1 bg-white text-ink text-xs font-semibold px-3 py-1.5 rounded-full hover:shadow-card transition-shadow">
                  Try AutoClip →
                </span>
              </Link>
            </div>
          </div>
          {/* Footer bar */}
          <div className="border-t border-gray-100 bg-surface px-5 py-3 flex items-center justify-between">
            <p className="text-xs text-ink-soft">All {TOOL_COUNT} tools are included in your workspace.</p>
            <Link href="/dashboard/tools" className="text-xs font-semibold text-brand hover:text-brand-dark transition-colors">
              View All Tools →
            </Link>
          </div>
        </NavDropdown>
      </nav>

      {/* Global search — grows to fill the middle */}
      <div className="flex-1 flex justify-center min-w-0">
        <HeaderSearch />
      </div>

      <div className="flex items-center gap-2.5 flex-shrink-0">
        {user ? (
          <>
            <CreateMenu />

            {/* Plan chip + credits */}
            <Link
              href="/billing"
              title="Your plan"
              className={`hidden md:inline-flex items-center text-[11px] font-bold uppercase tracking-wider rounded-full px-2.5 py-1 transition-colors ${
                hasActivePlan
                  ? "bg-tint-emerald text-green-700 hover:bg-emerald-100"
                  : "bg-gray-100 text-ink-soft hover:bg-gray-200"
              }`}
            >
              {planName}
            </Link>
            <CreditsPill credits={user.credits ?? 0} />

            {/* Monetization CTA: upgrade when free, top up when subscribed */}
            <Button variant={hasActivePlan ? "secondary" : "primary"} size="sm" href="/billing" className="hidden sm:inline-flex">
              {hasActivePlan ? "Top Up" : "Upgrade"}
            </Button>

            <SidebarAccount />
          </>
        ) : (
          <Button variant="primary" size="md" onClick={() => openAuthModal("login")}>
            <IcZap />
            Login
          </Button>
        )}
      </div>
    </header>
  );
}
