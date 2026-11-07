"use client";

// Shared pieces for the Diwali 2026 launch banners: the decoration SVGs, the
// right-to-left marquee, and the hooks that decide what shows when.

import { Children, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { DIWALI, diwaliOfferId, diwaliPhase, isDiwaliOfferLive, type DiwaliPhase } from "@/lib/campaigns/diwali";
import s from "./diwali.module.css";

export { s as diwaliStyles };

/** Campaign phase, re-checked every 30s so a page left open across launch
 *  (or across the offer's end) switches over by itself. */
export function useDiwaliPhase(): { phase: DiwaliPhase; offerLive: boolean } {
  const [now, setNow] = useState(() => Date.now());
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    // Dev only: ?diwaliPreview=live shows the launch-week banners early.
    if (process.env.NODE_ENV !== "production") {
      setPreview(new URLSearchParams(window.location.search).get("diwaliPreview") === "live");
    }
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (preview) return { phase: "live", offerLive: true };
  return { phase: diwaliPhase(now), offerLive: isDiwaliOfferLive(now) };
}

/** Which halves of the combined Diwali Launch Offer a banner may promise.
 *  Monthly (+50% first month) needs nothing from Razorpay, so it's announced
 *  from the countdown until the window closes. Yearly (extra 10%) is promised
 *  only once the Razorpay Offer id is configured — before launch as a
 *  heads-up, during launch week because checkout really applies it. */
export function useDiwaliOffers(): { phase: DiwaliPhase; monthly: boolean; yearly: boolean; any: boolean } {
  const { phase, offerLive } = useDiwaliPhase();
  const monthly = phase !== "over";
  const yearly = offerLive || (phase === "countdown" && diwaliOfferId() !== null);
  return { phase, monthly, yearly, any: monthly || yearly };
}

/** The two offer lines, worded once for every banner. */
export const OFFER_COPY = {
  monthly: `Monthly: ${DIWALI.monthlyBonusPct}% more minutes & credits in your first month`,
  monthlyShort: `Monthly: +${DIWALI.monthlyBonusPct}% minutes & credits`,
  yearly: `Yearly: extra ${DIWALI.extraPct}% off, on top of ${DIWALI.yearlyPct}%`,
  yearlyShort: `Yearly: extra ${DIWALI.extraPct}% off`,
} as const;

/** Days/hours/minutes/seconds to launch. Null until mounted, so the server
 *  HTML never carries digits that disagree with the visitor's clock. */
export function useLaunchCountdown(): { k: string; v: string }[] | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return null;
  const ms = Math.max(0, DIWALI.launchAt - now);
  const p = (n: number) => String(n).padStart(2, "0");
  return [
    { k: "Days", v: p(Math.floor(ms / 864e5)) },
    { k: "Hours", v: p(Math.floor(ms / 36e5) % 24) },
    { k: "Mins", v: p(Math.floor(ms / 6e4) % 60) },
    { k: "Secs", v: p(Math.floor(ms / 1e3) % 60) },
  ];
}

/** Remembered dismissal (per browser). By default starts "dismissed" until the
 *  stored value is read, so a closed banner never flashes back in on load;
 *  pass `initial: false` for one that must be in the server HTML. */
export function useDismissed(key: string, storage: "local" | "session" = "local", initial = true): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(initial);
  useEffect(() => {
    try {
      const store = storage === "local" ? window.localStorage : window.sessionStorage;
      setDismissed(store.getItem(key) === "1");
    } catch {
      setDismissed(false);
    }
  }, [key, storage]);
  const dismiss = () => {
    setDismissed(true);
    try {
      const store = storage === "local" ? window.localStorage : window.sessionStorage;
      store.setItem(key, "1");
    } catch {
      /* private mode: dismissed for this page view only */
    }
  };
  return [dismissed, dismiss];
}

/** Content scrolling right to left forever. Rendered twice so the loop is
 *  seamless; the copy is aria-hidden, so give the region its own label. */
export function Marquee({ children, duration = 30, className = "" }: { children: ReactNode; duration?: number; className?: string }) {
  const items = Children.toArray(children);
  return (
    <div className={`overflow-hidden ${className}`} aria-hidden="true">
      <div className={s.track} style={{ "--marquee-duration": `${duration}s` } as CSSProperties}>
        <div className="flex shrink-0 items-center">{items}</div>
        <div className="flex shrink-0 items-center">{items}</div>
      </div>
    </div>
  );
}

export function Diya({ size = 36, delay = 0, dark = false, className = "" }: { size?: number; delay?: number; dark?: boolean; className?: string }) {
  const flameStyle = delay ? { animationDelay: `-${delay}s` } : undefined;
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true" className={`shrink-0 ${className}`}>
      {!dark && <ellipse cx="18" cy="12" rx="8" ry="10" fill="#ffb02e" opacity=".22" />}
      <path className={s.flame} style={flameStyle} d="M18 3c3.4 5 4.4 8.5 0 13c-4.4-4.5-3.4-8 0-13z" fill={dark ? "#c2410c" : "#ffcf5a"} />
      {!dark && <path className={s.flame} style={flameStyle} d="M18 8c1.6 3 2.1 4.6 0 7.5c-2.1-2.9-1.6-4.5 0-7.5z" fill="#fff3c4" />}
      <path d="M3 19h30c-1.5 7-7.5 11-15 11S4.5 26 3 19z" fill={dark ? "#1a0f02" : "#d9661f"} />
      {!dark && <path d="M3 19h30" stroke="#f5b544" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}

export function Lantern({ width = 54, delay = 0, className = "", style }: { width?: number; delay?: number; className?: string; style?: CSSProperties }) {
  return (
    <div className={`${s.swing} pointer-events-none ${className}`} style={{ ...style, animationDelay: delay ? `-${delay}s` : undefined }} aria-hidden="true">
      <svg width={width} height={(width * 170) / 54} viewBox="0 0 54 170">
        <line x1="27" y1="0" x2="27" y2="70" stroke="#f5b544" strokeOpacity=".6" strokeWidth="1.5" />
        <rect x="17" y="68" width="20" height="6" rx="2" fill="#f5b544" />
        <path d="M27 74 L50 104 L27 134 L4 104 Z" fill="#c2410c" />
        <path d="M27 74 L38 104 L27 134 L16 104 Z" fill="#ff9f1c" />
        <ellipse cx="27" cy="104" rx="7" ry="9" fill="#fff3c4" opacity=".9" />
        <path d="M20 136 L27 166 L34 136" fill="none" stroke="#ffd23f" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

export function Sparkle({ size = 14, color = "#ffd23f", delay = 0, className = "", style }: { size?: number; color?: string; delay?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      aria-hidden="true"
      className={`${s.twinkle} pointer-events-none ${className}`}
      style={{ ...style, animationDelay: delay ? `-${delay}s` : undefined }}
    >
      <path d="M7 0 L8.4 5.6 L14 7 L8.4 8.4 L7 14 L5.6 8.4 L0 7 L5.6 5.6 Z" fill={color} />
    </svg>
  );
}

const PETALS = [0, 45, 90, 135, 180, 225, 270, 315];

export function Rangoli({ size = 440, spin = true, className = "", style }: { size?: number; spin?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 300 300" aria-hidden="true" className={`pointer-events-none ${spin ? s.spin : ""} ${className}`} style={style}>
      <circle cx="150" cy="150" r="140" fill="none" stroke="#f5b544" strokeOpacity=".35" strokeWidth="1.5" strokeDasharray="2 8" />
      <circle cx="150" cy="150" r="122" fill="none" stroke="#20d68a" strokeOpacity=".35" strokeWidth="1" />
      <g fill="#ff9f1c" fillOpacity=".85">
        {PETALS.map((r) => <ellipse key={r} cx="150" cy="62" rx="16" ry="38" transform={`rotate(${r} 150 150)`} />)}
      </g>
      <g fill="#00a968">
        {PETALS.map((r) => <ellipse key={r} cx="150" cy="92" rx="11" ry="26" transform={`rotate(${r + 22.5} 150 150)`} />)}
      </g>
      <circle cx="150" cy="150" r="44" fill="#ffd23f" />
      <circle cx="150" cy="150" r="30" fill="#d9661f" />
      <circle cx="150" cy="150" r="14" fill="#fff3c4" />
    </svg>
  );
}

export function Toran({ small = false, className = "" }: { small?: boolean; className?: string }) {
  return <div aria-hidden="true" className={`${small ? s.toranSmall : s.toran} ${className}`} />;
}
