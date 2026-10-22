"use client";
// The looping before/after previews on the AI Tools hub. Each one is real
// footage from the tool artwork in public/tools/ (cropped into
// public/tools/hub/), animated in CSS — see hub.module.css. A tool with no
// preview here falls back to its icon, so a new registry entry still renders.

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ToolIcon } from "@/app/components/toolIcons";
import type { FeatureLink } from "@/app/components/featureLinks";
import s from "./hub.module.css";

const IMG = "/tools/hub";

// Deterministic bar heights (percent): same markup on server and client.
function bars(n: number, f: (i: number) => number) {
  return Array.from({ length: n }, (_, i) => ({ h: Math.round(f(i)), d: -(i % 9) * 0.11 }));
}
const NOISY = (n: number) => bars(n, (i) => 18 + 50 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.37)) + (i % 3) * 8);
const CLEAN: Record<string, (n: number) => ReturnType<typeof bars>> = {
  "ai-speech-enhancer": (n) => bars(n, (i) => 12 + 64 * Math.abs(Math.sin(i * 0.27 * (56 / n))) * (0.55 + 0.45 * Math.abs(Math.cos(i * 0.11)))),
  "ai-voice-changer": (n) => bars(n, (i) => 12 + 70 * Math.pow(Math.abs(Math.sin(i * 0.42 * (56 / n) + 0.6)), 1.6)),
  "ai-voiceover": (n) => bars(n, (i) => 16 + 58 * Math.abs(Math.sin(i * 0.5 * (56 / n))) * (0.6 + 0.4 * Math.abs(Math.sin(i * 0.07)))),
  "ai-vocal-remover": (n) => bars(n, (i) => 30 + 26 * Math.abs(Math.sin(i * 0.9))),
};

function Bars({ list }: { list: ReturnType<typeof bars> }) {
  return <>{list.map((b, i) => <i key={i} style={{ height: `${b.h}%`, animationDelay: `${b.d}s` }} />)}</>;
}

function Knob() {
  return (
    <span className={s.knob}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 7-5 5 5 5M15 7l5 5-5 5" /></svg>
    </span>
  );
}

function Wipe({ before, after, size, className = "", style, children }: {
  before: ReactNode; after: ReactNode; size: "stage" | "thumb"; className?: string; style?: React.CSSProperties; children?: ReactNode;
}) {
  return (
    <div className={`${s.ba} ${className}`} style={style}>
      {before}
      {after}
      <span className={s.bar}>{size === "stage" && <Knob />}</span>
      {children}
    </div>
  );
}

function Ring({ size }: { size: number }) {
  return (
    <div className={s.overlay}>
      <div className={s.stack}>
        <svg className={s.loading} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
          <circle className={s.ringTrack} cx="24" cy="24" r="20" fill="none" strokeWidth={3.5} />
          <circle className={`${s.ring} ${s.ringFill}`} cx="24" cy="24" r="20" fill="none" strokeWidth={3.5} strokeLinecap="round" transform="rotate(-90 24 24)" />
        </svg>
        <span className={s.done} style={{ width: size * 0.8, height: size * 0.8 }}>
          <svg width={size * 0.36} height={size * 0.36} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
        </span>
      </div>
    </div>
  );
}

/** A portrait image centred on a blurred copy of itself. */
function Centered({ backdrop, ratio, children }: { backdrop: string; ratio: string; children: (style: React.CSSProperties) => ReactNode }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative blur, sized by CSS */}
      <img className={s.backdrop} src={backdrop} alt="" />
      <div className={`${s.enter} absolute inset-0 flex items-center justify-center p-8`}>
        {children({ height: "100%", aspectRatio: ratio, borderRadius: 16, boxShadow: "0 30px 80px rgb(0 0 0 / .6)" })}
      </div>
    </>
  );
}

/* eslint-disable @next/next/no-img-element -- fixed-size local previews; next/image adds nothing here and fights the absolute layering */

export function ToolStage({ tool }: { tool: FeatureLink }) {
  const t = useTranslations("Tools.hub.preview");
  switch (tool.slug) {
    case "subtitle-remover":
      return (
        <Centered backdrop={`${IMG}/sub-after.webp`} ratio="445/507">
          {(st) => (
            <Wipe size="stage" style={st}
              before={<img className={s.layer} src={`${IMG}/sub-before.webp`} alt={t("subBefore")} />}
              after={<img className={`${s.layer} ${s.after}`} src={`${IMG}/sub-after.webp`} alt={t("subAfter")} />}>
              <span className={`${s.tag} ${s.tagBefore}`}>{t("withSubtitles")}</span>
              <span className={`${s.tag} ${s.tagAfter}`}>{t("clean")}</span>
            </Wipe>
          )}
        </Centered>
      );
    case "cut-and-crop":
      return (
        // Wrapped, not `absolute` on .crop itself: module CSS (unlayered) beats
        // Tailwind utilities, so .crop's position:relative would win and the
        // box would collapse to zero height.
        <div className={`${s.enter} absolute inset-0`}>
          <div className={`${s.crop} h-full w-full`}>
            <img className={s.layer} src={`${IMG}/crop-wide.webp`} alt={t("cropAlt")} />
            <div className={s.win}><span className={s.winLabel}>{t("tracking")}</span></div>
            <span className={`${s.tag} ${s.tagBefore}`}>{t("original169")}</span>
          </div>
        </div>
      );
    case "ai-face-swap":
      return (
        <>
          <img className={s.backdrop} src={`${IMG}/face-adam.webp`} alt="" />
          <div className={`${s.enter} absolute inset-0 flex items-center justify-center`}>
            <Wipe size="stage" style={{ width: "46%", aspectRatio: "1", borderRadius: "50%", boxShadow: "0 0 0 4px color-mix(in srgb, var(--primary) 35%, transparent), 0 30px 80px rgb(0 0 0 / .6)" }}
              before={<img className={s.layer} style={{ transform: "scale(1.18)" }} src={`${IMG}/face-adam.webp`} alt={t("faceSource")} />}
              after={<img className={`${s.layer} ${s.after}`} style={{ transform: "scale(1.18)" }} src={`${IMG}/face-sofia.webp`} alt={t("faceSwapped")} />} />
          </div>
          <span className={`${s.tag} ${s.tagBefore}`}>{t("source")}</span>
          <span className={`${s.tag} ${s.tagAfter}`}>{t("swapped")}</span>
        </>
      );
    case "youtube-downloader":
      return (
        <div className={`${s.enter} absolute inset-0`}>
          <img className={s.layer} src={`${IMG}/yt.webp`} alt={t("ytAlt")} />
          <Ring size={112} />
          <span className={`${s.tag} ${s.tagAfter}`}>MP4 · 1080p</span>
        </div>
      );
    case "instagram-downloader":
      return (
        <Centered backdrop={`${IMG}/insta.webp`} ratio="236/310">
          {(st) => (
            <div className="relative overflow-hidden" style={st}>
              <img className={s.layer} src={`${IMG}/insta.webp`} alt={t("igAlt")} />
              <Ring size={96} />
              <span className={`${s.tag} ${s.tagBefore}`}>{t("reel")}</span>
            </div>
          )}
        </Centered>
      );
    case "background-remover":
      return (
        <Centered backdrop={`${IMG}/bg-before.webp`} ratio="376/422">
          {(st) => (
            <Wipe size="stage" style={st}
              before={<img className={s.layer} src={`${IMG}/bg-before.webp`} alt={t("bgBefore")} />}
              after={<div className={`${s.layer} ${s.after} ${s.checker}`}><img className={s.layer} src={`${IMG}/bg-after.webp`} alt={t("bgAfter")} /></div>}>
              <span className={`${s.tag} ${s.tagBefore}`}>{t("original")}</span>
              <span className={`${s.tag} ${s.tagAfter}`}>{t("cutOut")}</span>
            </Wipe>
          )}
        </Centered>
      );
    case "ai-image-generator":
      return (
        <>
          <img className={s.backdrop} src={`${IMG}/gen-2.webp`} alt="" />
          <div className={`${s.enter} absolute inset-0 flex flex-col items-center justify-center gap-4 p-9`}>
            <div className="flex h-12 w-full max-w-[560px] items-center gap-2.5 rounded-xl border border-line-strong bg-bg/80 px-4 font-mono text-[15px] text-fg">
              <ToolIcon name="sparkle" className="h-4 w-4 flex-none text-primary" />
              <span className={s.typed}>{t("genPrompt")}</span>
            </div>
            <div className={`${s.genGrid} w-full max-w-[560px] gap-3 [aspect-ratio:1.6] [&>img]:rounded-xl`}>
              {[1, 2, 3, 4].map((n) => <img key={n} src={`${IMG}/gen-${n}.webp`} alt={t("genAlt", { n })} />)}
            </div>
          </div>
        </>
      );
    case "ai-speech-enhancer":
    case "ai-voice-changer":
    case "ai-voiceover":
    case "ai-vocal-remover": {
      const labels: Record<string, [string, string]> = {
        "ai-speech-enhancer": [t("noisy"), t("studioClean")],
        "ai-voice-changer": [t("originalVoice"), t("newVoice")],
        "ai-voiceover": [t("script"), t("narrated")],
        "ai-vocal-remover": [t("fullMix"), t("instrumental")],
      };
      const [b, a] = labels[tool.slug];
      return (
        <>
          {/* Same wrapper reason as cut-and-crop: .ba is position:relative. */}
          <div className={`${s.enter} absolute inset-0`}>
            <Wipe size="stage" className="h-full w-full"
              before={<div className={`${s.layer} ${s.wave} ${s.noisy}`}><Bars list={NOISY(56)} /></div>}
              after={<div className={`${s.layer} ${s.wave} ${s.clean} ${s.after}`}><Bars list={CLEAN[tool.slug](56)} /></div>}>
              <span className={`${s.tag} ${s.tagBefore}`}>{b}</span>
              <span className={`${s.tag} ${s.tagAfter}`}>{a}</span>
            </Wipe>
          </div>
          {tool.slug === "ai-voice-changer" && (
            <>
              <span className={`${s.enter} absolute bottom-5 left-5 z-[4] flex items-center gap-2.5 rounded-full border border-line bg-bg/80 py-2 pl-2 pr-3.5 text-[13px] text-fg`}>
                <img src={`${IMG}/face-adam.webp`} alt="" className="h-[34px] w-[34px] rounded-full" />Adam · {t("deep")}
              </span>
              <span className={`${s.enter} absolute bottom-5 right-5 z-[4] flex items-center gap-2.5 rounded-full border border-primary/40 bg-bg/80 py-2 pl-2 pr-3.5 text-[13px] text-primary`}>
                <img src={`${IMG}/face-sofia.webp`} alt="" className="h-[34px] w-[34px] rounded-full" />Sofia · {t("natural")}
              </span>
            </>
          )}
          {tool.slug === "ai-voiceover" && (
            <span className={`${s.enter} absolute bottom-5 left-5 z-[4] max-w-[60%] rounded-xl border border-line bg-bg/80 px-3.5 py-2.5 text-[13px] text-fg-muted`}>
              {t("voiceoverLine")}
            </span>
          )}
        </>
      );
    }
    default:
      return (
        <div className={`${s.enter} absolute inset-0 flex items-center justify-center`}>
          <span className="flex h-24 w-24 items-center justify-center rounded-3xl border border-line bg-surface-3 text-primary">
            <ToolIcon name={tool.icon} className="h-10 w-10" />
          </span>
        </div>
      );
  }
}

/** The small looping preview at the start of a tool row. */
export function ToolThumb({ tool, offset = 0 }: { tool: FeatureLink; offset?: 0 | 1 | 2 }) {
  const off = offset === 1 ? s.offset1 : offset === 2 ? s.offset2 : "";
  const box = `${s.thumb} ${off} h-10 w-14 flex-none overflow-hidden rounded-lg`;
  switch (tool.slug) {
    case "subtitle-remover":
      return (
        <Wipe size="thumb" className={box}
          before={<img className={s.layer} style={{ objectPosition: "50% 85%" }} src={`${IMG}/sub-before.webp`} alt="" />}
          after={<img className={`${s.layer} ${s.after}`} style={{ objectPosition: "50% 85%" }} src={`${IMG}/sub-after.webp`} alt="" />} />
      );
    case "cut-and-crop":
      return (
        <div className={`${s.crop} ${box}`}>
          <img className={s.layer} src={`${IMG}/crop-wide.webp`} alt="" />
          <div className={s.win} />
        </div>
      );
    case "ai-face-swap":
      return (
        <Wipe size="thumb" className={box}
          before={<img className={s.layer} src={`${IMG}/face-adam.webp`} alt="" />}
          after={<img className={`${s.layer} ${s.after}`} src={`${IMG}/face-sofia.webp`} alt="" />} />
      );
    case "youtube-downloader":
      return <div className={box}><img className="h-full w-full object-cover" src={`${IMG}/yt.webp`} alt="" /></div>;
    case "instagram-downloader":
      return <div className={box}><img className="h-full w-full object-cover object-[50%_30%]" src={`${IMG}/insta.webp`} alt="" /></div>;
    case "background-remover":
      return (
        <Wipe size="thumb" className={box}
          before={<img className={s.layer} style={{ objectPosition: "50% 25%" }} src={`${IMG}/bg-before.webp`} alt="" />}
          after={<div className={`${s.layer} ${s.after} ${s.checker}`}><img className={s.layer} style={{ objectPosition: "50% 25%" }} src={`${IMG}/bg-after.webp`} alt="" /></div>} />
      );
    case "ai-image-generator":
      return (
        <div className={`${s.genGrid} ${box} gap-0.5 bg-surface-3 p-0.5 [&>img]:rounded`}>
          {[1, 2, 3, 4].map((n) => <img key={n} src={`${IMG}/gen-${n}.webp`} alt="" />)}
        </div>
      );
    default: {
      const clean = CLEAN[tool.slug];
      if (clean) {
        return (
          <Wipe size="thumb" className={box}
            before={<div className={`${s.layer} ${s.wave} ${s.noisy}`}><Bars list={NOISY(14)} /></div>}
            after={<div className={`${s.layer} ${s.wave} ${s.clean} ${s.after}`}><Bars list={clean(14)} /></div>} />
        );
      }
      return (
        <span className={`${box} flex items-center justify-center border border-line bg-surface-3 text-primary`}>
          <ToolIcon name={tool.icon} className="h-5 w-5" />
        </span>
      );
    }
  }
}
/* eslint-enable @next/next/no-img-element */

/** Tools that have a stage preview; the others only appear in the bottom strip. */
export const STAGE_GROUPS = ["video", "image", "audio"] as const;
