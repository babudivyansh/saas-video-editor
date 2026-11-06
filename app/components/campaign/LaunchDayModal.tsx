"use client";

// One-time launch popup on dashboard Home (mockup 6): the first visit during
// launch week, once per browser. The dashboard page only mounts it when no
// onboarding overlay (welcome screen, product tour) is showing.

import { useEffect, useState } from "react";
import ClipiroLogo from "@/app/components/ClipiroLogo";
import { Modal } from "@/app/components/ui/Modal";
import { useBillingOverlay } from "@/app/components/billing/BillingOverlayContext";
import { DIWALI } from "@/lib/campaigns/diwali";
import { Diya, Marquee, diwaliStyles as s, useDiwaliPhase } from "./DiwaliDecor";

const SEEN_KEY = "clipiro:diwali26:launch-modal";
const DIYAS = Array.from({ length: 20 }, (_, i) => i);
const BURSTS = [
  { hue: "#ffd23f", cls: "left-5 top-2.5 h-40 w-40", delay: 0 },
  { hue: "#20d68a", cls: "right-10 -top-5 h-40 w-40", delay: 1 },
  { hue: "#ff9f1c", cls: "left-[42%] top-10 h-28 w-28", delay: 1.9 },
];

export default function LaunchDayModal() {
  const { phase, offerLive } = useDiwaliPhase();
  const { openBilling } = useBillingOverlay();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (phase !== "live") return;
    let seen = false;
    try { seen = window.localStorage.getItem(SEEN_KEY) === "1"; } catch { /* storage blocked */ }
    if (seen) return;
    // A beat after Home settles, so it doesn't land on top of the first paint.
    const t = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(t);
  }, [phase]);

  const close = () => {
    setOpen(false);
    try { window.localStorage.setItem(SEEN_KEY, "1"); } catch { /* storage blocked */ }
  };

  if (!open) return null;

  return (
    <Modal open onClose={close} bare ariaLabel="Clipiro is live" maxWidth="max-w-[520px]" panelClassName="!bg-[#0b1210] overflow-hidden">
      <div className="relative font-sans text-[#eef5f1]">
        <div aria-hidden="true" className="relative h-[200px] overflow-hidden bg-[#0d0a04]">
          {BURSTS.map((b, i) => (
            <svg key={i} viewBox="0 0 100 100" className={`${s.burst} absolute ${b.cls}`} style={{ animationDelay: `-${b.delay}s` }}>
              <path d="M50 10v14M50 76v14M10 50h14M76 50h14M22 22l10 10M68 68l10 10M78 22L68 32M32 68L22 78" stroke={b.hue} strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="50" cy="50" r="4" fill={b.hue} />
            </svg>
          ))}
          <ClipiroLogo className="absolute left-5 top-[18px] h-[26px]" />
          <p className={`${s.serif} absolute inset-x-0 top-14 m-0 text-center text-[44px] text-[#ffd23f] sm:text-[56px]`}>Shubh Deepavali</p>
          <div className="absolute inset-x-0 bottom-3.5">
            <Marquee duration={16}>
              {DIYAS.map((i) => <Diya key={i} size={44} delay={i * 0.19} className="mr-2.5" />)}
            </Marquee>
          </div>
        </div>

        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-[10px] text-[#c9b98f] hover:text-[#fff3c4]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>

        <div className="flex flex-col items-center gap-2.5 px-6 pb-7 pt-6 text-center sm:px-8">
          <h2 className="m-0 text-[26px] font-extrabold tracking-[-0.02em] sm:text-[28px]">Clipiro is live{offerLive ? " — and it’s on us" : ""}</h2>
          <p className="m-0 max-w-[400px] text-[15px] leading-relaxed text-[#a9bdb3]">
            We launched on Diwali, 8 November 2026.
            {offerLive && (
              <>
                {" "}Take <strong className="text-[#ffd23f]">an extra {DIWALI.extraPct}% off</strong> yearly plans, on top of the usual {DIWALI.yearlyPct}%,
                applied automatically until {DIWALI.endLabel}.
              </>
            )}
          </p>
          <div className="mt-2.5 flex flex-wrap justify-center gap-2.5">
            {offerLive && (
              <button
                type="button"
                onClick={() => { close(); openBilling({ view: "plans" }); }}
                className="inline-flex h-[46px] items-center rounded-[10px] bg-[#00a968] px-5 text-[15px] font-bold text-[#021a10] transition-colors hover:bg-[#20d68a]"
              >
                Claim extra {DIWALI.extraPct}% off
              </button>
            )}
            <button
              type="button"
              onClick={close}
              className="h-[46px] rounded-[10px] border border-[#2a3a33] px-[18px] text-[15px] font-semibold text-[#eef5f1] hover:border-[#3d5a4c]"
            >
              {offerLive ? "Maybe later" : "Let’s go"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
