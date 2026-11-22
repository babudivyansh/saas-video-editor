"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MotionConfig, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { DWELL_MS, HERO_FEATURES } from "./features";
import { PANELS } from "./HeroPanels";

// The hero's feature carousel: a centre stage with the neighbouring panels
// peeking in on either side (desktop), arrows, a tab row under it, swipe on
// touch, and arrow-key navigation on the tabs. Like a slider, it has ends:
// the first panel has nothing to its left and the last nothing to its right,
// and the arrow that would go past an end is disabled. Autoplay goes on from
// the last panel back to the first.
//
// Autoplay moves on after each panel's DWELL_MS while the carousel is on screen, but only
// until the visitor touches it (any click, key or swipe stops it for good)
// and never for reduced-motion visitors. It also waits while the pointer or
// focus is inside, so nothing moves out from under someone typing a link.

const GAP = 24;
const N = HERO_FEATURES.length;

const TAB_ICONS: Record<string, React.ReactNode> = {
  clipping: <path d="M6 3a3 3 0 100 6 3 3 0 000-6zM6 15a3 3 0 100 6 3 3 0 000-6zM20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12" />,
  captions: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 15h4M13 15h4M7 11h10" /></>,
  reframe: <><path d="M3 9V5a2 2 0 012-2h4M21 9V5a2 2 0 00-2-2h-4M3 15v4a2 2 0 002 2h4M21 15v4a2 2 0 01-2 2h-4" /><rect x="9" y="7" width="6" height="10" rx="1" /></>,
  broll: <><rect x="3" y="6" width="13" height="13" rx="2" /><path d="M8 3h11a2 2 0 012 2v11" /></>,
  speech: <path d="M11 5L6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14" />,
  voiceover: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></>,
};

function near(active: number, prev: Set<number>): Set<number> {
  const next = new Set(prev);
  for (const d of [-1, 0, 1]) if (active + d >= 0 && active + d < N) next.add(active + d);
  return next.size === prev.size ? prev : next;
}

const PLACED = "absolute top-0";

/**
 * Desktop arrows sit this far outside the stage's edges (their left edge),
 * so they float over the peeking neighbour panels as in a slider, not over
 * the stage's own content.
 */
const ARROW_OUT = 74;

function ArrowButton({
  dir,
  disabled,
  onClick,
  style,
  preMeasure,
}: {
  dir: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
  style?: React.CSSProperties;
  preMeasure: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous feature" : "Next feature"}
      className={
        "absolute z-20 h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface-3/90 text-fg ring-1 ring-white/12 backdrop-blur transition outline-none focus-visible:ring-2 focus-visible:ring-emerald-bright " +
        (disabled ? "cursor-default opacity-35 " : "cursor-pointer hover:bg-surface-3 hover:ring-emerald-bright/60 ") +
        // Before measuring, a CSS guess at the desktop spot; phones wait.
        (preMeasure
          ? `top-1/2 hidden md:flex ${dir === "prev" ? "left-[calc(16%-74px)]" : "right-[calc(16%-74px)]"}`
          : "flex")
      }
      style={style}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path d={dir === "prev" ? "M19 12H5M11 18l-6-6 6-6" : "M5 12h14M13 6l6 6-6 6"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
const PRE_MEASURE =
  "relative mx-auto aspect-[1/1.32] max-h-[600px] w-full max-w-[1000px] md:aspect-[1000/590] md:max-h-none md:w-[68%]";

/** How many places a panel sits from the stage (negative: to the left). */
function offsetOf(i: number, active: number): number {
  return i - active;
}

export default function HeroShowcase() {
  const reduce = useReducedMotion() === true;
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [inView, setInView] = useState(false);
  const [width, setWidth] = useState(0);
  // Panels whose videos may be fetched: the stage and both neighbours, and
  // once fetched a panel stays loaded.
  const [loaded, setLoaded] = useState<Set<number>>(() => near(0, new Set()));
  const rootRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Stage width follows the container; the panel is ~68% of it on desktop so
  // both neighbours show, and the full width on phones.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const go = useCallback((i: number, byUser = true) => {
    if (byUser) setTouched(true);
    const idx = ((i % N) + N) % N;
    setActive(idx);
    setLoaded((prev) => near(idx, prev));
  }, []);

  useEffect(() => {
    if (reduce || touched || hovering || !inView) return;
    const id = window.setTimeout(() => go(active + 1, false), DWELL_MS[HERO_FEATURES[active].id]);
    return () => window.clearTimeout(id);
  }, [active, reduce, touched, hovering, inView, go]);

  const measured = width > 0;
  const narrow = measured && width < 768;
  const panelW = narrow ? width : Math.min(1000, Math.round(width * 0.68));
  const panelH = narrow ? Math.round(Math.min(600, panelW * 1.32)) : Math.round(panelW * 0.59);
  // Desktop arrows sit beside the stage at mid-height; on phones that is where
  // the link box is, so they move to the free strip along the panel's foot.
  const arrowTop = narrow ? panelH - 30 : panelH / 2;

  function onTabKey(e: React.KeyboardEvent, i: number) {
    let to: number | null = null;
    if (e.key === "ArrowRight") to = i + 1;
    else if (e.key === "ArrowLeft") to = i - 1;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = N - 1;
    if (to === null) return;
    e.preventDefault();
    const idx = ((to % N) + N) % N;
    go(idx);
    tabRefs.current[idx]?.focus();
  }

  function onDragEnd(_: unknown, info: PanInfo) {
    if ((info.offset.x < -60 || info.velocity.x < -400) && active < N - 1) go(active + 1);
    else if ((info.offset.x > 60 || info.velocity.x > 400) && active > 0) go(active - 1);
  }

  const offsets = HERO_FEATURES.map((_, i) => offsetOf(i, active));

  const current = HERO_FEATURES[active];

  return (
    <MotionConfig reducedMotion="user">
    <div
      className="w-full"
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onFocusCapture={() => setHovering(true)}
      onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHovering(false); }}
    >
      <div
        ref={rootRef}
        role="region"
        aria-roledescription="carousel"
        aria-label="What Clipiro does"
        className="relative w-full"
        style={{ height: measured ? panelH : undefined }}
      >
        {HERO_FEATURES.map((f, i) => {
          const o = offsets[i];
          const isActive = o === 0;
          const visible = narrow ? isActive : Math.abs(o) <= 1;
          const Panel = PANELS[f.id];
          // Before the stage is measured (server HTML, first paint) only the
          // first panel shows, sized by CSS. It is the same element the
          // carousel then positions, so the stage is never remounted (its
          // videos and demo round carry straight on). The others
          // get a new key once measured, so they mount straight into their
          // places (initial={false}) rather than flying out from the centre.
          const placed = measured ? PLACED : isActive ? PRE_MEASURE : "hidden";
          const key = measured || isActive ? f.id : `${f.id}-pre`;
          return (
            <motion.div
              key={key}
              id={`hero-panel-${f.id}`}
              role="tabpanel"
              aria-labelledby={`hero-tab-${f.id}`}
              aria-hidden={!isActive}
              className={`${placed} overflow-hidden rounded-[28px] bg-[radial-gradient(120%_90%_at_50%_0%,color-mix(in_oklab,var(--emerald-brand)_14%,var(--surface-2)),var(--surface-2)_60%)] ring-1 ring-white/8`}
              style={measured ? { width: panelW, height: panelH, left: `calc(50% - ${panelW / 2}px)` } : undefined}
              initial={false}
              // Always a full target (framer skips a first target that
              // arrives after mounting with none): before measuring, the
              // stage at rest; after, each panel's place in the strip.
              animate={
                measured
                  ? { x: o * (panelW + GAP), scale: isActive ? 1 : 0.94, opacity: visible ? (isActive ? 1 : 0.6) : 0 }
                  : { x: 0, scale: 1, opacity: isActive ? 1 : 0 }
              }
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 210, damping: 30 }}
              drag={narrow && isActive ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={onDragEnd}
            >
              {/* Only the stage takes input; a peeking neighbour is one big
                  "go there" target (keyboard users have the arrows and tabs). */}
              <div inert={!isActive || undefined} className="h-full">
                <Panel active={isActive} load={measured && loaded.has(i)} playing={isActive && inView} />
              </div>
              {!isActive && visible && (
                <div className="absolute inset-0 cursor-pointer" aria-hidden="true" onClick={() => go(i)} />
              )}
            </motion.div>
          );
        })}

        <ArrowButton
          dir="prev"
          disabled={active === 0}
          onClick={() => go(active - 1)}
          style={measured ? { top: arrowTop, left: narrow ? 10 : `calc(50% - ${panelW / 2 + ARROW_OUT}px)` } : undefined}
          preMeasure={!measured}
        />
        <ArrowButton
          dir="next"
          disabled={active === N - 1}
          onClick={() => go(active + 1)}
          style={measured ? { top: arrowTop, right: narrow ? 10 : `calc(50% - ${panelW / 2 + ARROW_OUT}px)` } : undefined}
          preMeasure={!measured}
        />
      </div>

      <div
        role="tablist"
        aria-label="Clipiro features"
        className="mx-auto mt-6 flex w-full max-w-full snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] md:justify-center md:gap-3"
      >
        {HERO_FEATURES.map((f, i) => {
          const on = i === active;
          return (
            <button
              key={f.id}
              ref={(el) => { tabRefs.current[i] = el; }}
              id={`hero-tab-${f.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`hero-panel-${f.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => go(i)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={
                "flex shrink-0 snap-start cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2.5 text-[14px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-bright " +
                (on ? "bg-white/10 text-fg ring-1 ring-white/20" : "text-fg-muted ring-1 ring-white/8 hover:bg-white/5 hover:text-fg")
              }
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {TAB_ICONS[f.id]}
              </svg>
              {f.label}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-center text-sm text-fg-muted" aria-live="polite">
        {current.blurb}{" "}
        <a href={current.href} className="font-semibold text-emerald-bright underline-offset-4 hover:underline">
          See how it works
        </a>
      </p>
    </div>
    </MotionConfig>
  );
}
