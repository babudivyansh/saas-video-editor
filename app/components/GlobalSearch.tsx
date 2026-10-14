"use client";

// The desktop top bar's search (every page but Home): tools and pages match
// instantly from the shared index, and the user's clips come from
// /api/clips?q= as they type. Ctrl/⌘+K focuses it from anywhere except the
// Assets page, whose own Ctrl+K opens its command palette.

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/app/components/AuthContext";
import { useSearchIndex, type SearchEntry } from "@/app/components/DashboardHeader";
import { clipHref } from "@/lib/project-links";

interface ClipHit {
  id: string;
  projectId: string;
  title: string | null;
  projectTitle: string;
  score: number | null;
  thumbnailUrl: string | null;
}

type Row =
  | { kind: "entry"; key: string; entry: SearchEntry }
  | { kind: "clip"; key: string; clip: ClipHit };

const IcSearch = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;

export function GlobalSearch() {
  const t = useTranslations("Nav");
  const router = useRouter();
  const pathname = usePathname();
  const { token } = useAuth();
  const index = useSearchIndex();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [clips, setClips] = useState<ClipHit[]>([]);
  // "⌘" on a Mac, "Ctrl" elsewhere — read after mount so SSR markup matches.
  const [mod, setMod] = useState("Ctrl");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time platform read
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setMod("⌘");
  }, []);

  // Ctrl/⌘+K — not on Assets, which binds the same keys to its own palette.
  const pageOwnsShortcut = pathname.startsWith("/dashboard/assets");
  useEffect(() => {
    if (pageOwnsShortcut) return;
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      inputRef.current?.focus();
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageOwnsShortcut]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Clip titles, debounced; a stale response never overwrites a newer query.
  const q = query.trim();
  useEffect(() => {
    if (q.length < 2 || !token) {
      setClips([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clips?q=${encodeURIComponent(q)}&limit=4&sort=score`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = res.ok ? await res.json() : { clips: [] };
        if (!cancelled) setClips(data.clips ?? []);
      } catch {
        if (!cancelled) setClips([]);
      }
    }, 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [q, token]);

  const rows = useMemo<Row[]>(() => {
    if (!q) return [];
    const lower = q.toLowerCase();
    const entries = index
      .filter((e) => e.title.toLowerCase().includes(lower) || e.desc.toLowerCase().includes(lower))
      .slice(0, 6)
      .map((entry) => ({ kind: "entry" as const, key: `e:${entry.href}:${entry.title}`, entry }));
    const clipRows = clips.map((clip) => ({ kind: "clip" as const, key: `c:${clip.id}`, clip }));
    return [...entries, ...clipRows];
  }, [q, index, clips]);

  // Keep the highlight in range as results change.
  const activeRow = Math.min(active, Math.max(rows.length - 1, 0));

  function choose(row: Row) {
    setQuery("");
    setOpen(false);
    (document.activeElement as HTMLElement | null)?.blur();
    if (row.kind === "clip") {
      router.push(clipHref(row.clip.projectId, row.clip.id));
    } else if (row.entry.onSelect) {
      row.entry.onSelect();
    } else {
      router.push(row.entry.href);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); return; }
    if (!rows.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((activeRow + 1) % rows.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((activeRow - 1 + rows.length) % rows.length); }
    else if (e.key === "Enter") { e.preventDefault(); choose(rows[activeRow]); }
  }

  const showList = open && q.length > 0;

  return (
    <div ref={boxRef} className="relative w-full">
      <label className="relative flex h-10 items-center rounded-xl border border-line bg-surface-2 transition-colors focus-within:border-primary/50">
        <span className="sr-only">{t("findLabel")}</span>
        <span className="pointer-events-none absolute left-3.5 text-fg-subtle"><IcSearch /></span>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls="global-search-results"
          aria-activedescendant={showList && rows[activeRow] ? `gs-${activeRow}` : undefined}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t("findPlaceholder")}
          className="h-full w-full bg-transparent pl-10 pr-16 text-sm text-fg placeholder:text-fg-subtle outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {!pageOwnsShortcut && <kbd className="pointer-events-none absolute right-2.5 rounded-md border border-line bg-surface-3 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-fg-muted">
          {mod} K
        </kbd>}
      </label>

      {showList && (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-line bg-panel py-1.5 shadow-xl"
        >
          {rows.length === 0 ? (
            <p className="px-4 py-3 text-sm text-fg-muted">{t("findNoResults")}</p>
          ) : (
            rows.map((row, i) => (
              <button
                key={row.key}
                id={`gs-${i}`}
                type="button"
                role="option"
                aria-selected={i === activeRow}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(row)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === activeRow ? "bg-surface-3" : ""}`}
              >
                {row.kind === "clip" ? (
                  <>
                    <span className="h-10 w-[22px] flex-shrink-0 overflow-hidden rounded bg-surface-3">
                      {row.clip.thumbnailUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.clip.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg">{row.clip.title ?? row.clip.projectTitle}</span>
                      <span className="block truncate text-xs text-fg-muted">{row.clip.projectTitle}</span>
                    </span>
                    {typeof row.clip.score === "number" && (
                      <span className="text-xs font-bold text-primary">{row.clip.score}</span>
                    )}
                    <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg-muted">{t("findClip")}</span>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg">{row.entry.title}</span>
                      <span className="block truncate text-xs text-fg-muted">{row.entry.desc}</span>
                    </span>
                    <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg-muted">{row.entry.group}</span>
                  </>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
