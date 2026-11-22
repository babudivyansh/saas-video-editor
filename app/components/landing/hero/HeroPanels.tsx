"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimate, useReducedMotion } from "framer-motion";
import LoopVideo from "./LoopVideo";
import MockClipBar, { HandCursor } from "./MockClipBar";
import CaptionTemplateRender, { type PreviewWord } from "@/app/components/captions/CaptionTemplateRender";
import { findCaptionTemplate, parseCaptionSample, type CaptionTemplateSpec } from "@clipiro/shared/caption-templates";
import { useVideoClock } from "./useVideoClock";
import { CLIP_ROUND_MS, CLIP_ROUNDS, media, type ClipPlatform, type FeatureId } from "./features";
import { BROLL_WINDOWS, CAPTION_WORDS, DEMO_SECONDS, REFRAME_BOXES, VOICE_LINES, type Word } from "./demoTimeline";
import { FacebookColor, InstagramColor, LinkedInColor, TikTokColor, XColor, YoutubeColor } from "./BrandIcons";

// The six stages of the hero carousel. Every moving picture is a real muted
// loop (LoopVideo); the overlays on top (captions, the reframe window, the
// B-roll cut, the script highlight) are HTML driven by that video's clock, so
// nothing here calls an AI service or uploads anything.

export interface PanelProps {
  /** The panel is the one on stage (it alone takes input). */
  active: boolean;
  /** Near enough the stage to fetch its videos. */
  load: boolean;
  /** Its videos should be running. */
  playing: boolean;
}

// A video's rounded, lit frame, without a position, for frames that are
// themselves absolutely placed (a `relative` here would win over it).
const frameSkin = "overflow-hidden rounded-2xl bg-surface-3 ring-1 ring-white/8 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.8)]";
const frame = `relative ${frameSkin}`;
const card = "rounded-2xl border border-white/10 bg-bg/75 p-4 text-left backdrop-blur-md";
const chip = "rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors";

function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`absolute rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white ${className}`}>
      {children}
    </span>
  );
}

const PLATFORM_ICON: Record<ClipPlatform, { Icon: (p: { className?: string }) => React.ReactElement; name: string }> = {
  youtube: { Icon: YoutubeColor, name: "YouTube" },
  instagram: { Icon: InstagramColor, name: "Instagram" },
  linkedin: { Icon: LinkedInColor, name: "LinkedIn" },
  tiktok: { Icon: TikTokColor, name: "TikTok" },
  facebook: { Icon: FacebookColor, name: "Facebook" },
  x: { Icon: XColor, name: "X" },
};

/**
 * A clip's virality score: a small dark tile at its bottom-left, hanging a
 * little past the clip's edge, with a tiny "SCORE" over the number.
 */
function ScoreBadge({ score }: { score: number }) {
  return (
    <span className="absolute -bottom-2 left-2.5 z-[1] flex flex-col items-center rounded-lg bg-[rgba(58,60,62,0.82)] px-[7px] pb-[3px] pt-1 leading-none shadow-[0_4px_12px_rgba(0,0,0,0.45)] backdrop-blur-sm">
      <span className="font-semibold uppercase tracking-[0.06em] text-white/55" style={{ fontSize: 7.5 }}>Score</span>
      <span className="mt-[3px] text-[17px] font-extrabold tracking-[-0.02em] text-primary">{score}</span>
    </span>
  );
}

const RATIO_CLASS = { "16:9": "aspect-video", "9:16": "aspect-[9/16]", "1:1": "aspect-square" } as const;
const RATIO_WIDTH = { "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1 } as const;

// ─── Motion helpers ─────────────────────────────────────────────────────────

/** Counts how many times a panel has come on stage, so entrances can replay. */
function useActivations(active: boolean): number {
  const [seen, setSeen] = useState({ active, n: 0 });
  if (seen.active !== active) setSeen({ active, n: active ? seen.n + 1 : seen.n });
  return seen.n;
}

/**
 * Plays a short entrance (slide/scale/fade in) each time its panel comes on
 * stage after the first paint. It animates the element in place rather than
 * remounting it, so the videos inside keep playing and never reload.
 */
function Enter({
  active,
  dx = 0,
  dy = 0,
  ds = 1,
  delay = 0,
  className = "",
  children,
}: {
  active: boolean;
  dx?: number;
  dy?: number;
  ds?: number;
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const reduce = useReducedMotion() === true;
  const mounted = useRef(false);
  useEffect(() => {
    // The panel that is on stage at first paint is already in place.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!active || reduce) return;
    animate(
      scope.current,
      { opacity: [0, 1], x: [dx, 0], y: [dy, 0], scale: [ds, 1] },
      { duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] },
    );
  }, [active, reduce, animate, scope, dx, dy, ds, delay]);
  return (
    <div ref={scope} className={className}>
      {children}
    </div>
  );
}

// ─── 1. AI clipping ─────────────────────────────────────────────────────────
//
// One round, like a pipeline through the link bar (the canvas demo "Drop and
// spread"):
//   0.00s  the drawn cursor clicks Get clips (MockClipBar);
//   0.25s  the clips on show slide off to the right;
//   0.30s  the long video glides down behind the bar into the clip row,
//          shrinking as it goes, and fades there;
//   0.35s  the next long video slides in from the top;
//   0.85s  a soft green flash marks the hand-off in the row;
//   0.95s  the new clips spread outward from the middle with an overshoot.
// Then it holds until CLIP_ROUND_MS is up. Every round shares one ratio
// order, so the row's layout, and the paths measured from it, never change.

interface RowGeometry {
  /** Long video's centre to the row's centre, and the scale that makes it row-high. */
  dropY: number;
  dropScale: number;
  /** Per clip: its slot's offset from the row's centre. */
  fromMid: number[];
}

// A clip is born at the middle of the row, a third of its size, and spreads
// out to its slot with a small overshoot; when its round ends it slides away
// to the right.
const CLIP_MOTION = {
  born: (c?: { fromMid: number; i: number }) => ({ x: c?.fromMid ?? 0, scale: 0.35, opacity: 0 }),
  shown: (c?: { fromMid: number; i: number }) => ({
    x: 0,
    scale: 1,
    opacity: 1,
    transition: {
      duration: 0.6,
      ease: [0.34, 1.45, 0.64, 1] as const,
      // Outward from the middle: the centre clips first, the ends last.
      delay: 0.95 + Math.abs((c?.i ?? 0) - 2.5) * 0.08,
    },
  }),
  gone: () => ({
    x: 360,
    opacity: 0,
    transition: { duration: 0.5, ease: [0.55, 0, 0.75, 0.3] as const, delay: 0.25 },
  }),
};

function ClippingPanel({ active, load, playing }: PanelProps) {
  const reduce = useReducedMotion() === true;
  const [round, setRound] = useState(0);
  const epoch = useActivations(active);
  const rootRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [geo, setGeo] = useState<RowGeometry>({ dropY: 260, dropScale: 0.6, fromMid: [] });

  const next = useCallback(() => setRound((r) => (r + 1) % CLIP_ROUNDS.length), []);

  // Next round while the panel is on stage and playing.
  useEffect(() => {
    if (!playing || reduce) return;
    const id = window.setTimeout(next, CLIP_ROUND_MS);
    return () => window.clearTimeout(id);
  }, [playing, reduce, round, epoch, next]);

  // Geometry from layout boxes (offset*, which ignore the transforms being
  // animated), re-measured whenever the panel changes size.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => {
      const slot = slotRef.current;
      const row = rowRef.current;
      const items = itemRefs.current;
      const shown = items.filter((el): el is HTMLLIElement => !!el && el.offsetWidth > 0);
      if (!slot || !row || shown.length === 0) return;
      const slotMid = slot.offsetTop + slot.offsetHeight / 2;
      const rowMid = row.offsetTop + row.offsetHeight / 2;
      const last = shown[shown.length - 1];
      const midX = (shown[0].offsetLeft + last.offsetLeft + last.offsetWidth) / 2;
      setGeo({
        dropY: rowMid - slotMid,
        dropScale: Math.min(1, row.offsetHeight / slot.offsetHeight),
        fromMid: items.map((el) => (el ? midX - (el.offsetLeft + el.offsetWidth / 2) : 0)),
      });
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  const r = CLIP_ROUNDS[round];
  // A new key each round, and each return to the stage, replays the pipeline.
  const key = `${round}-${epoch}`;
  return (
    <div ref={rootRef} className="relative flex h-full flex-col items-center justify-center gap-4 px-4 py-6 md:gap-5 md:px-8">
      {/* Under the link box, so the long video passes behind it on its way
          down; over the clip row, which it lands in. */}
      <div ref={slotRef} className="relative z-[2] aspect-video w-[72%] max-w-[360px] md:w-[36%]">
        <AnimatePresence initial={false}>
          <motion.div
            key={key}
            className={`${frameSkin} absolute inset-0`}
            initial={{ y: "-150%", scale: 0.9, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1, transition: { delay: 0.35, duration: 0.65, ease: [0.22, 1, 0.36, 1] } }}
            exit={{
              y: geo.dropY,
              scale: [1, Math.min(0.56, geo.dropScale), Math.min(0.5, geo.dropScale)],
              opacity: [1, 1, 0],
              transition: { duration: 1.05, times: [0, 0.7, 1], ease: [0.65, 0, 0.35, 1], delay: 0.3 },
            }}
          >
            <LoopVideo {...media(r.long)} load={load} playing={playing} />
            <Badge className="bottom-2 right-2">{r.longLength}</Badge>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative z-10 flex w-full justify-center">
        <MockClipBar press={round + epoch * CLIP_ROUNDS.length} />
      </div>

      {/* Warm the cache for the next round while this one holds, so its clips
          land with their pictures instead of a blank frame. */}
      {load && (
        <div aria-hidden="true" className="hidden">
          {[CLIP_ROUNDS[(round + 1) % CLIP_ROUNDS.length]].flatMap((n) => [n.long, ...n.clips.map((c) => c.name)]).map((name) => (
            // eslint-disable-next-line @next/next/no-img-element -- cache warm-up only, never shown
            <img key={name} src={media(name).poster} alt="" />
          ))}
          <link rel="prefetch" as="video" href={media(CLIP_ROUNDS[(round + 1) % CLIP_ROUNDS.length].long).src} />
        </div>
      )}

      <div ref={rowRef} className="relative z-0 mt-3 w-full max-w-[860px]">
        {/* The hand-off: a soft green flash where the long video lands. */}
        <motion.div
          key={`flash-${key}`}
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[120px] w-[240px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--emerald-bright)_55%,transparent),transparent)]"
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: [0, 0.9, 0], scale: [0.4, 1, 1.9] }}
          transition={{ duration: 0.7, times: [0, 0.4, 1], ease: "easeOut", delay: 0.85 }}
        />
        <AnimatePresence initial={false} mode="popLayout">
          <motion.ul
            key={key}
            className="relative flex w-full items-end justify-center gap-2 md:gap-2.5"
            initial="born"
            animate="shown"
            exit="gone"
            aria-label="Example clips cut from the long video"
          >
            {r.clips.map((clip, i) => {
              const p = PLATFORM_ICON[clip.platform];
              // Phones show four; the two landscape-heavy ones drop out.
              const phoneHidden = i === 0 || i === 5 ? "hidden sm:block" : "";
              return (
                <motion.li
                  key={clip.name}
                  ref={(el) => { itemRefs.current[i] = el; }}
                  custom={{ fromMid: geo.fromMid[i] ?? 0, i }}
                  variants={CLIP_MOTION}
                  // Each clip's share of the row is its width at a common height,
                  // so the row always fits the panel and every clip lines up.
                  style={{ flex: `${RATIO_WIDTH[clip.ratio]} ${RATIO_WIDTH[clip.ratio]} 0%` }}
                  className={`relative min-w-0 ${phoneHidden}`}
                >
                  <div className={`${frame} ${RATIO_CLASS[clip.ratio]} w-full rounded-xl`}>
                    <LoopVideo {...media(clip.name)} load={load} playing={playing} />
                  </div>
                  <ScoreBadge score={clip.score} />
                  <span
                    className="absolute left-1/2 z-[1] flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-[rgba(58,60,62,0.92)] shadow-[0_4px_12px_rgba(0,0,0,0.45)]"
                    style={{ top: -16 }}
                  >
                    <p.Icon className="h-4 w-4" />
                    <span className="sr-only">{`${p.name}, ${clip.ratio}, score ${clip.score}`}</span>
                  </span>
                </motion.li>
              );
            })}
          </motion.ul>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── 2. AI captioning ───────────────────────────────────────────────────────
//
// A wide podcast shot beside a Presets list of real Clipiro caption templates
// (packages/shared caption library), drawn by the same CaptionTemplateRender
// the app's pickers and editor use, so each look here is the look a clip
// exports with. A drawn cursor works down the list: it glides to a preset,
// clicks, and the caption on the video switches to that template. It is a
// picture: nothing in it takes input.

const CAPTION_PRESETS = ["boardroom", "redbox", "pill", "neontrace", "megaphone", "bubbles"]
  .map((id) => findCaptionTemplate(id))
  .filter((t): t is CaptionTemplateSpec => t !== null);

/** How long the cursor stays on each row (No captions, then every preset). */
export const CAPTION_STEP_MS = 1800;

/** The transcript of captions-wide.mp4, as the renderer's timed words (ms). */
const VIDEO_WORDS: PreviewWord[] = (CAPTION_WORDS as Word[]).map((w) => ({ text: w.w, start: w.s * 1000, end: w.e * 1000 }));

/** A preset's own sample line, first three words, frozen with the second spoken. */
function swatchWords(t: CaptionTemplateSpec): PreviewWord[] {
  return parseCaptionSample(t.sample)
    .slice(0, 3)
    .map((tok, i) => ({ text: tok.text, start: i * 400, end: i * 400 + 380 }));
}

function NoCaptionsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] text-fg-subtle" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </svg>
  );
}

function CaptionsPanel({ active, load, playing }: PanelProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const t = useVideoClock(ref, playing);
  const reduce = useReducedMotion() === true;
  // `target` is the row the cursor heads for; `chosen` changes on its click.
  const [target, setTarget] = useState(1);
  const [chosen, setChosen] = useState(1);
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const cursorRef = useRef<HTMLSpanElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rows = CAPTION_PRESETS.length + 1;

  useEffect(() => {
    if (!playing || reduce) return;
    const id = setInterval(() => setTarget((s) => (s + 1) % rows), CAPTION_STEP_MS);
    return () => clearInterval(id);
  }, [playing, reduce, rows]);

  useEffect(() => {
    const card = scope.current;
    const row = rowRefs.current[target];
    const cursor = cursorRef.current;
    if (!card || !row || !cursor) return;
    let live = true;
    const c = card.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    const x = r.right - c.left - 30;
    const y = r.top - c.top + r.height * 0.32;
    (async () => {
      await animate(cursor, { x, y }, { duration: reduce ? 0 : 0.55, ease: [0.4, 0, 0.2, 1] });
      if (!live) return;
      if (!reduce) await animate(cursor, { scale: [1, 0.8, 1] }, { duration: 0.26 });
      if (live) setChosen(target);
    })();
    return () => {
      live = false;
    };
  }, [target, animate, scope, reduce]);

  const spec = chosen > 0 ? CAPTION_PRESETS[chosen - 1] : null;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-3 py-4 sm:flex-row sm:gap-6 md:px-8">
      <Enter active={active} dy={40} ds={0.92} className="w-full sm:w-[60%]">
        <div className={`${frame} aspect-video w-full`}>
          <LoopVideo ref={ref} {...media("captions-wide")} load={load} playing={playing} restart />
          {spec && (
            <div className="absolute inset-0">
              <CaptionTemplateRender key={spec.id} template={spec} words={VIDEO_WORDS} timeMs={t * 1000} scene={false} fill positionY={80} />
            </div>
          )}
        </div>
      </Enter>
      <Enter active={active} dx={60} delay={0.15} className="min-h-0 w-full flex-1 sm:h-[88%] sm:w-[34%] sm:flex-none">
        <p className="sr-only">Clipiro caption presets: {CAPTION_PRESETS.map((p) => p.name).join(", ")}.</p>
        <div
          ref={scope}
          aria-hidden="true"
          className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface-2/90 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.8)] backdrop-blur-md"
        >
          <div className="flex shrink-0 gap-4 border-b border-white/10 px-3.5 py-2.5 text-[12.5px]">
            <span className="font-semibold text-fg">Presets</span>
            <span className="text-fg-subtle">Font</span>
            <span className="text-fg-subtle">Effects</span>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-x-2 gap-y-1.5 overflow-hidden p-2.5 sm:grid-cols-1">
            {[null, ...CAPTION_PRESETS].map((p, i) => (
              <div key={p?.id ?? "none"} ref={(el) => { rowRefs.current[i] = el; }} className="flex flex-col items-center gap-1">
                <div
                  className={`relative flex h-9 w-full items-center justify-center overflow-hidden rounded-lg bg-white/[0.06] transition-shadow duration-200 ${chosen === i ? "shadow-[0_0_0_2px_var(--fg)]" : ""}`}
                >
                  {p ? (
                    // The renderer sizes type from its frame's short side (9%), so
                    // the frame is taller than the tile (clipped by it) to give
                    // the type a readable size at the template's own spacing.
                    <div className="absolute inset-x-0 top-1/2" style={{ height: 136, transform: "translateY(-50%)" }}>
                      <CaptionTemplateRender template={p} words={swatchWords(p)} timeMs={450} scene={false} fill sizeScale={1 / Math.max(p.type.size, 1)} positionY={50} />
                    </div>
                  ) : (
                    <NoCaptionsIcon />
                  )}
                </div>
                <span className="text-[11.5px] leading-none text-fg-muted">{p ? p.name : "No captions"}</span>
              </div>
            ))}
          </div>
          {!reduce && (
            <span ref={cursorRef} className="pointer-events-none absolute left-0 top-0 z-10 block origin-[30%_10%]">
              <HandCursor />
            </span>
          )}
        </div>
      </Enter>
    </div>
  );
}

// ─── 3. AI reframe ──────────────────────────────────────────────────────────
//
// Before and after, like a streamer's Short: the wide live-stream shot with
// the two crops the AI picks marked on it (the gameplay window and the
// facecam), a row of dots ticking through the work, then the vertical
// "gameplay layout" (facecam stacked over gameplay) landing on a small fan of
// cards. Replays every REFRAME_ROUND_MS and each time the panel comes back.

const REFRAME_ROUND_MS = 9000;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

type Box = { left: number; top: number; width: number; height: number };

function AiBox({ box, delay, chip }: { box: Box; delay: number; chip: string }) {
  return (
    <motion.div
      className="pointer-events-none absolute rounded-md border-2 border-primary shadow-[0_0_18px_rgba(200,255,85,0.35)]"
      style={{ left: `${box.left * 100}%`, top: `${box.top * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }}
      initial={{ opacity: 0, scale: 1.12 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.45, ease: EASE_OUT }}
    >
      <span className={`absolute top-1 flex items-center gap-0.5 rounded-full bg-primary px-1.5 py-px text-[9.5px] font-bold text-on-primary ${chip}`}>
        <span aria-hidden="true">✦</span> AI
      </span>
    </motion.div>
  );
}

const pill = "rounded-full bg-white/10 px-4 py-1.5 text-[13px] font-medium text-fg backdrop-blur-sm";

function ReframePanel({ active, load, playing }: PanelProps) {
  const seen = useActivations(active);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setRound((r) => r + 1), REFRAME_ROUND_MS);
    return () => clearInterval(id);
  }, [playing]);
  const key = `${seen}-${round}`;
  const after = media("reframe-after");
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-3 py-4 sm:flex-row sm:gap-6 md:px-10">
      <Enter active={active} dx={-60} className="flex w-full flex-col items-center gap-3 sm:w-[50%]">
        <div className={`${frame} aspect-video w-full`}>
          <LoopVideo {...media("reframe-before")} load={load} playing={playing} restart />
          <div key={key} aria-hidden="true">
            <AiBox box={REFRAME_BOXES.game} delay={0.3} chip="left-1/2 -translate-x-1/2" />
            <AiBox box={REFRAME_BOXES.face} delay={0.6} chip="left-1" />
          </div>
        </div>
        <span className={pill}>Before</span>
      </Enter>

      <div key={`dots-${key}`} className="flex shrink-0 gap-2" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.span
            key={i}
            className="h-2 w-2 rounded-full bg-fg"
            initial={{ opacity: 0.2, scale: 1 }}
            animate={{ opacity: [0.2, 1, 1], scale: [1, 1.5, 1] }}
            transition={{ delay: 0.9 + i * 0.26, duration: 0.4, times: [0, 0.5, 1] }}
          />
        ))}
      </div>

      <Enter active={active} dx={60} delay={0.15} className="flex h-[44%] flex-col items-center gap-3 sm:h-[86%]">
        <div key={key} className="relative aspect-[9/16]" style={{ height: "calc(100% - 2.75rem)" }}>
          {[-1, 1].map((side) => (
            <motion.div
              key={side}
              className={`absolute inset-0 ${frameSkin} opacity-45`}
              initial={{ opacity: 0, rotate: 0, x: 0, scale: 0.9 }}
              animate={{ opacity: 0.45, rotate: side * 6, x: side * 16, scale: 0.94 }}
              transition={{ delay: 2.55, duration: 0.55, ease: EASE_OUT }}
              aria-hidden="true"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={after.poster} alt="" className="h-full w-full object-cover" loading="lazy" />
            </motion.div>
          ))}
          <motion.div
            className={`absolute inset-0 ${frameSkin}`}
            initial={{ opacity: 0, scale: 0.8, x: -50 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ delay: 2.3, duration: 0.6, ease: [0.34, 1.3, 0.64, 1] }}
          >
            <LoopVideo {...after} load={load} playing={playing} restart />
          </motion.div>
        </div>
        <motion.span key={`label-${key}`} className={pill} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.6, duration: 0.4 }}>
          Gameplay layout
        </motion.span>
      </Enter>
    </div>
  );
}

// ─── 4. AI B-roll ───────────────────────────────────────────────────────────

function BrollPanel({ active, load, playing }: PanelProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const t = useVideoClock(ref, playing);
  const duration = DEMO_SECONDS;
  const cut = BROLL_WINDOWS.some((w) => t >= w.from && t < w.to);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4 py-6 md:px-10">
      <div className="flex h-[66%] items-center gap-6">
        <Enter active={active} dy={36} ds={0.9} className="h-full">
        <div className={`${frame} aspect-[9/16] h-full`}>
          <LoopVideo ref={ref} {...media("broll-main")} load={load} playing={playing} restart />
          <div className={`absolute inset-0 transition-opacity duration-300 ${cut ? "opacity-100" : "opacity-0"}`}>
            <LoopVideo {...media("broll-insert")} load={load} playing={playing} restart />
          </div>
          {cut && <span className="absolute left-2 top-2 rounded-md bg-emerald-brand px-1.5 py-0.5 text-[10px] font-bold text-white">B-roll</span>}
        </div>
        </Enter>
        <Enter active={active} dx={60} delay={0.15} className="hidden sm:block">
        <div className={`${card} w-[200px]`} aria-hidden="true">
          <p className="text-[13px] font-semibold text-fg">B-roll</p>
          <p className="mt-0.5 text-[12px] text-fg-subtle">Matched to what is being said</p>
          <span className="mt-3 block rounded-full bg-fg px-3 py-2 text-center text-[12.5px] font-semibold text-bg">Add AI B-roll</span>
        </div>
        </Enter>
      </div>
      {/* Timeline: the clip's own frames, the cutaways above them, a playhead. */}
      <Enter active={active} dy={30} delay={0.25} className="w-full max-w-[620px]">
      <div className="relative w-full" aria-hidden="true">
        <div className="relative mb-1.5 h-5">
          {BROLL_WINDOWS.map((w) => (
            <span
              key={w.from}
              className="absolute top-0 h-5 rounded-md bg-emerald-brand/25 px-1.5 text-[10px] font-semibold leading-5 text-emerald-bright ring-1 ring-emerald-bright/50"
              style={{ left: `${(w.from / duration) * 100}%`, width: `${((w.to - w.from) / duration) * 100}%` }}
            >
              B-roll
            </span>
          ))}
        </div>
        <div className="h-11 overflow-hidden rounded-lg ring-1 ring-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative filmstrip */}
          <img src="/hero/demo/broll-strip.webp" alt="" className="h-full w-full object-cover" loading="lazy" />
        </div>
        <span className="absolute -top-1 bottom-0 w-0.5 rounded bg-fg" style={{ left: `${Math.min(100, (t / duration) * 100)}%` }} />
      </div>
      </Enter>
    </div>
  );
}

// ─── 5. AI speech enhance ───────────────────────────────────────────────────

/** One waveform row: dim in full, lit up to the playhead (`pct`). */
function Wave({ src, on, label, pct }: { src: string; on: boolean; label: string; pct: number }) {
  return (
    <div className={`rounded-xl p-2.5 ring-1 transition-colors ${on ? "bg-emerald-brand/10 ring-emerald-bright/50" : "bg-white/[0.03] ring-white/8"}`}>
      <p className={`mb-1 text-left text-[11px] font-semibold uppercase tracking-wider ${on ? "text-emerald-bright" : "text-fg-subtle"}`}>{label}</p>
      <div className="relative h-10 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- 2 KB decorative strip */}
        <img src={src} alt="" className="h-full w-full object-fill opacity-40" loading="lazy" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- same strip, lit */}
          <img src={src} alt="" className={`h-full w-full object-fill ${on ? "" : "opacity-80"}`} loading="lazy" />
        </div>
      </div>
    </div>
  );
}

function SpeechPanel({ active, load, playing }: PanelProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const t = useVideoClock(ref, playing);
  const [after, setAfter] = useState(true);
  const duration = DEMO_SECONDS;
  const pct = Math.min(100, (t / duration) * 100);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-4 py-6 sm:flex-row md:gap-8 md:px-10">
      <Enter active={active} dx={-60} className="w-full max-w-[420px] sm:w-[50%]">
      <div className={`${frame} aspect-video w-full`}>
        <LoopVideo ref={ref} {...media("speech")} load={load} playing={playing} restart />
      </div>
      </Enter>
      <Enter active={active} dx={60} delay={0.15} className="w-full max-w-[320px]">
      <div className="flex w-full flex-col gap-2.5" inert={!active || undefined}>
        <div className="flex gap-1.5 self-start rounded-full bg-white/5 p-1" role="radiogroup" aria-label="Compare audio">
          {[false, true].map((a) => (
            <button
              key={String(a)}
              type="button"
              role="radio"
              aria-checked={after === a}
              onClick={() => setAfter(a)}
              className={`${chip} cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-emerald-bright ${after === a ? "bg-emerald-brand text-white" : "text-fg-muted hover:text-fg"}`}
            >
              {a ? "Enhanced" : "Original"}
            </button>
          ))}
        </div>
        <Wave src="/hero/demo/wave-noisy.webp" on={!after} label="Original · room noise" pct={pct} />
        <Wave src="/hero/demo/wave-clean.webp" on={after} label="Enhanced · voice only" pct={pct} />
        <p className="text-left text-[11.5px] text-fg-subtle">Illustration: waveforms of the clip, with room noise added to show the before.</p>
      </div>
      </Enter>
    </div>
  );
}

// ─── 6. AI voice-over ───────────────────────────────────────────────────────

const VOICES = ["Warm", "Calm", "Bright"];

function VoiceoverPanel({ active, load, playing }: PanelProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const t = useVideoClock(ref, playing);
  const [voice, setVoice] = useState(VOICES[0]);
  const line = VOICE_LINES.findIndex((l) => t >= l.from && t < l.to);
  return (
    <div className="flex h-full flex-col-reverse items-center justify-center gap-5 px-4 py-6 sm:flex-row md:gap-8 md:px-10">
      <Enter active={active} dx={-60} delay={0.1} className="w-full max-w-[300px]">
      <div className={`${card} w-full`} inert={!active || undefined}>
        <p className="text-[13px] font-semibold text-fg">Script</p>
        <div className="mt-2 space-y-1.5 text-[13px] leading-snug">
          {VOICE_LINES.map((l, i) => (
            <p key={l.from} className={`transition-colors duration-200 ${i === line ? "text-fg" : "text-fg-subtle"}`}>{l.text}</p>
          ))}
        </div>
        <p className="mt-3 text-[12px] font-semibold text-fg-muted">Voice</p>
        <div className="mt-1.5 flex gap-1.5" role="radiogroup" aria-label="Voice">
          {VOICES.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={voice === v}
              onClick={() => setVoice(v)}
              className={`${chip} cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-emerald-bright ${voice === v ? "bg-emerald-brand/20 text-emerald-bright ring-1 ring-emerald-bright/50" : "bg-white/5 text-fg-muted hover:bg-white/10"}`}
            >
              {v}
            </button>
          ))}
        </div>
        {/* Bars move with the line being read; there is no audio on the page. */}
        <div className="mt-3 flex h-7 items-center gap-[3px]" aria-hidden="true">
          {Array.from({ length: 34 }, (_, i) => (
            <span
              key={i}
              className="w-[3px] rounded-full bg-emerald-bright/80 transition-[height] duration-150"
              style={{ height: playing && line >= 0 ? `${20 + Math.abs(Math.sin(i * 1.7 + t * 9)) * 80}%` : "18%" }}
            />
          ))}
        </div>
      </div>
      </Enter>
      <Enter active={active} dx={60} className="w-full max-w-[440px] sm:w-[52%]">
      <div className={`${frame} aspect-video w-full`}>
        <LoopVideo ref={ref} {...media("voiceover")} load={load} playing={playing} restart />
        {line >= 0 && (
          <span className="absolute inset-x-6 bottom-3 text-center text-[14px] font-semibold text-white [text-shadow:0_2px_8px_#000]" aria-hidden="true">
            {VOICE_LINES[line].text}
          </span>
        )}
      </div>
      </Enter>
    </div>
  );
}

export const PANELS: Record<FeatureId, (p: PanelProps) => React.ReactElement> = {
  clipping: ClippingPanel,
  captions: CaptionsPanel,
  reframe: ReframePanel,
  broll: BrollPanel,
  speech: SpeechPanel,
  voiceover: VoiceoverPanel,
};
