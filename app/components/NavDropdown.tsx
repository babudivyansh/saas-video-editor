"use client";

// Dashboard-header dropdown shell + item row. A trimmed port of
// SiteNavbar.tsx's NavDropdown/DropdownItem (same hover-intent open,
// outside-click close, chevron rotate) kept as its own copy rather than
// imported from SiteNavbar — that file is the live public marketing navbar,
// out of scope to touch/couple to here. The one real change from that
// original: the panel is always mounted and animated between open/closed
// states instead of conditionally rendered, so both opening and closing
// transition instead of snapping instantly.

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";

export interface NavItem {
  title: string;
  desc: string;
  href: string;
  external?: boolean;
}

function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function DropdownItem({ item, onNavigate, chip }: { item: NavItem; onNavigate: () => void; chip?: React.ReactNode }) {
  const className = `flex ${chip ? "items-center gap-3" : "flex-col gap-0.5"} rounded-xl px-3 py-2 transition-colors hover:bg-tint-blue group`;
  const content = (
    <>
      {chip}
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-semibold text-ink group-hover:text-brand transition-colors">{item.title}</span>
        <span className="text-xs leading-snug text-ink-soft">{item.desc}</span>
      </span>
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

// Opens on hover (with a short close delay so crossing the gap between
// trigger and panel doesn't flicker it shut) and on click (for touch).
// `align` controls anchoring: "center" (narrow menu centered under its
// trigger), "left" (panel's left edge flush with the trigger — for wider
// menus near the screen edge), or "screen" (mega-menu centered under the
// header).
export function NavDropdown({
  label,
  children,
  width,
  align = "center",
}: {
  label: string;
  children: React.ReactNode;
  width: number;
  align?: "center" | "left" | "screen";
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

  useEffect(() => cancelClose, []);

  const positionClass =
    align === "screen"
      ? "fixed top-[72px] left-1/2 -translate-x-1/2"
      : align === "left"
        ? "absolute top-full mt-3 left-0"
        : "absolute top-full mt-3 left-1/2 -translate-x-1/2";

  return (
    <div
      className="relative"
      ref={ref}
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors px-3 py-2 rounded-lg hover:bg-gray-50"
      >
        {label}
        <ChevronIcon className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Always mounted so both open and close animate — see file header. */}
      <div
        className={`${positionClass} origin-top rounded-[var(--radius-card)] border border-card-border bg-white shadow-xl z-50 overflow-hidden transition-all duration-200 ease-out ${
          open ? "opacity-100 scale-100 translate-y-0 visible" : "opacity-0 scale-95 -translate-y-1 invisible pointer-events-none"
        }`}
        style={{ width, maxWidth: "calc(100vw - 1.5rem)" }}
      >
        <div onClick={() => setOpen(false)}>{children}</div>
      </div>
    </div>
  );
}
