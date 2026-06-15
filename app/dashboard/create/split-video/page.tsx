"use client";
import { Suspense, useRef, useState, useEffect, type ReactNode, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ToolsSidebar from "@/app/components/ToolsSidebar";

// ── Icons ────────────────────────────────────────────────────────────────────
function IcFilm() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M17 7h5M2 17h5M17 17h5"/></svg>;
}
function IcLink() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>;
}
function IcCloud() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>;
}
function IcChevron() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 18l6-6-6-6"/></svg>;
}
function IcZap() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
}
function IcSparkle() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M12 2l1.9 5.6L19.5 9l-5.6 1.9L12 16l-1.9-5.1L4.5 9l5.6-1.4L12 2z"/></svg>;
}
function IcDiscord() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>;
}
function IcCheck() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="M5 13l4 4L19 7"/></svg>;
}
function IcFile() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
}
function IcX() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12"/></svg>;
}
function IcArrowRight() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M5 12h14M12 5l7 7-7 7"/></svg>;
}

// ── Steps ────────────────────────────────────────────────────────────────────
const STEPS = [
  { id: "upload-video", label: "Upload Video" },
  { id: "select-background", label: "Select Background" },
  { id: "select-subtitles", label: "Select Subtitles" },
];

// ── Background video data — all 36 from gameplay-cdn.com ────────────────────
const CDN     = "https://gameplay-cdn.com/gameplay";
const JAKEY   = "https://64.media.tumblr.com/8e073c3c73202376a83e782c25fc3012/163239d388b24cef-77/s640x960/a7ce4408f438a78ddc2e8011589a31c54215b2b8.jpg";
const SIR_SAT = "https://i.pinimg.com/736x/30/88/49/308849bbb361c64eb407cfb3be3aab4b.jpg";
const STEVE   = "https://minecraftpfp.com/api/pfp/null.png";
const MARIO   = "https://i.pinimg.com/736x/8a/79/5d/8a795df46777227e009cf7e3738ee07f.jpg";

const BACKGROUNDS = [
  { title: "Subway Surfers",  author: "Jakey",          authorImg: JAKEY,   mins: "2 mins",   size: "327 MB", id: "12dm7zdo-qhr4-9ro5-xb9p-794xmqsudvi" },
  { title: "Soap Video",      author: "Sir Satisfying", authorImg: SIR_SAT, mins: "1.0 mins", size: "93 MB",  id: "25r3klxv-8xnh-bx9z-0v5e-l02oj4wq85p" },
  { title: "Minecraft Video", author: "Steve",          authorImg: STEVE,   mins: "2 mins",   size: "84 MB",  id: "04k002fo-pf26-j5h1-v6ti-nxykcnf42"   },
  { title: "Mario Kart",      author: "Mario",          authorImg: MARIO,   mins: "2 mins",   size: "309 MB", id: "2fg1tjdy-8ngb-xg29-tz1y-ze3h4vxeih"  },
  { title: "Slime Video",     author: "Sir Satisfying", authorImg: SIR_SAT, mins: "0.9 mins", size: "204 MB", id: "0rbt0c54-ace8-8khb-nw6u-o6azecvjlzk"  },
  { title: "Subway Surfers",  author: "Jakey",          authorImg: JAKEY,   mins: "3 mins",   size: "536 MB", id: "00eieqe3-po4g-rh90-888c-zriwtgl77k"   },
  { title: "Soap Video",      author: "Sir Satisfying", authorImg: SIR_SAT, mins: "1.0 mins", size: "94 MB",  id: "27yzpm7j-wlau-sx6d-hguk-85621eh5k89"  },
  { title: "Minecraft Video", author: "Steve",          authorImg: STEVE,   mins: "2 mins",   size: "95 MB",  id: "1s739e44-vipb-57t9-5jqa-a14rqcc4upw"  },
  { title: "Mario Kart",      author: "Mario",          authorImg: MARIO,   mins: "2 mins",   size: "303 MB", id: "3ncmzbyx-jfrn-axi2-rq0d-t5kk8sbr9ha"  },
  { title: "Slime Video",     author: "Sir Satisfying", authorImg: SIR_SAT, mins: "1 mins",   size: "254 MB", id: "17bu4z5j-srkt-5b8j-q6ar-jdurow26pzn"  },
  { title: "Subway Surfers",  author: "Jakey",          authorImg: JAKEY,   mins: "1 mins",   size: "132 MB", id: "0vw1h3lz-2tt3-n7k7-b98p-9c154ozp06n"  },
  { title: "Soap Video",      author: "Sir Satisfying", authorImg: SIR_SAT, mins: "1.0 mins", size: "92 MB",  id: "2m69x29r-2jf4-me7c-v78s-vdwqcd5k4mn"  },
  { title: "Minecraft Video", author: "Steve",          authorImg: STEVE,   mins: "2 mins",   size: "131 MB", id: "23dfs135-48dv-e8rk-3uqs-i4k3nu5ut6n"  },
  { title: "Mario Kart",      author: "Mario",          authorImg: MARIO,   mins: "1 mins",   size: "165 MB", id: "10xr2xpw-tode-8jnk-v1ke-zv3svbi4w3"  },
  { title: "Slime Video",     author: "Sir Satisfying", authorImg: SIR_SAT, mins: "0.7 mins", size: "170 MB", id: "1ty6nlgz-tn87-8p6c-c5z3-0sqlp10wdf5r" },
  { title: "Subway Surfers",  author: "Jakey",          authorImg: JAKEY,   mins: "3 mins",   size: "378 MB", id: "24fmrp9x-0hak-r5rd-7nft-652n4dvo2y5"  },
  { title: "Soap Video",      author: "Sir Satisfying", authorImg: SIR_SAT, mins: "1 mins",   size: "97 MB",  id: "2trross0-2cbw-vxl9-vz05-0oc0dez0efx"  },
  { title: "Minecraft Video", author: "Steve",          authorImg: STEVE,   mins: "1 mins",   size: "38 MB",  id: "0864s7f0-u5v3-vrhb-lyef-n6lrc1oblvk"  },
  { title: "Mario Kart",      author: "Mario",          authorImg: MARIO,   mins: "3 mins",   size: "458 MB", id: "1idc8qo6-2w9u-5eud-xwm2-nkaqgww6egm"  },
  { title: "Slime Video",     author: "Sir Satisfying", authorImg: SIR_SAT, mins: "1 mins",   size: "256 MB", id: "1ugj853n-7bon-dbtg-rh3g-2qb7ez2f1cz"  },
  { title: "Subway Surfers",  author: "Jakey",          authorImg: JAKEY,   mins: "1 mins",   size: "186 MB", id: "3mrc3y7k-gjyh-kadj-vlqn-vrb147gzep"   },
  { title: "Soap Video",      author: "Sir Satisfying", authorImg: SIR_SAT, mins: "1 mins",   size: "96 MB",  id: "313ylwzs-jxbb-x19i-vwo8-muwlzxih7um"  },
  { title: "Minecraft Video", author: "Steve",          authorImg: STEVE,   mins: "3 mins",   size: "133 MB", id: "0xacedg7-9dp8-8p3s-53zy-vt35lqhy0ml"  },
  { title: "Mario Kart",      author: "Mario",          authorImg: MARIO,   mins: "1 mins",   size: "138 MB", id: "2ibe7k60-x2i7-34t5-umje-a3s89d5ic4"   },
  { title: "Slime Video",     author: "Sir Satisfying", authorImg: SIR_SAT, mins: "0.9 mins", size: "213 MB", id: "4dsd1k4g-jie6-3a4o-c56q-g6ldu00mxmo"  },
  { title: "Subway Surfers",  author: "Jakey",          authorImg: JAKEY,   mins: "3 mins",   size: "375 MB", id: "4n2riglr-0hgm-erzz-0tlu-6ak40mdm95j"  },
  { title: "Soap Video",      author: "Sir Satisfying", authorImg: SIR_SAT, mins: "1 mins",   size: "98 MB",  id: "3n4gdxmp-kz62-usur-zbfw-paqdrcbzxv"   },
  { title: "Minecraft Video", author: "Steve",          authorImg: STEVE,   mins: "1 mins",   size: "51 MB",  id: "23h5er9b-981x-khfz-mjdd-v78quz93ewo"  },
  { title: "Mario Kart",      author: "Mario",          authorImg: MARIO,   mins: "3 mins",   size: "467 MB", id: "68bki2q6-vgfa-2q5b-fpoe-jiwjnaj2s4"   },
  { title: "Slime Video",     author: "Sir Satisfying", authorImg: SIR_SAT, mins: "0.9 mins", size: "208 MB", id: "4ly973he-fwmq-i78t-y16c-neo2iosu28"   },
  { title: "Subway Surfers",  author: "Jakey",          authorImg: JAKEY,   mins: "3 mins",   size: "378 MB", id: "5f23yh4q-mwsv-8uts-bnuc-909o0yyy5na"  },
  { title: "Minecraft Video", author: "Steve",          authorImg: STEVE,   mins: "1 mins",   size: "37 MB",  id: "5vrdji60-24vi-l7aw-pce4-vl2p8vrpii"   },
  { title: "Mario Kart",      author: "Mario",          authorImg: MARIO,   mins: "3 mins",   size: "477 MB", id: "6jww7z18-spei-32kn-9u6l-hm8rq6oq66n"  },
  { title: "Subway Surfers",  author: "Jakey",          authorImg: JAKEY,   mins: "1 mins",   size: "139 MB", id: "5p00qpnk-q5ok-njot-q8t5-hvoz6kyngq9"  },
  { title: "Minecraft Video", author: "Steve",          authorImg: STEVE,   mins: "1 mins",   size: "44 MB",  id: "6whgrwz6-l9ta-3jgl-oti4-5iia2q3s5us"  },
  { title: "Mario Kart",      author: "Mario",          authorImg: MARIO,   mins: "1 mins",   size: "137 MB", id: "7ob75v4o-vgia-vnwu-x7l5-bzh0kbxl224"  },
];

// ── Subtitle styles — CSS text tiles matching Crayo exactly ──────────────────
const OUTLINE = "1px 1px 0 #000,-1px 1px 0 #000,1px -1px 0 #000,-1px -1px 0 #000,0 2px 4px rgba(0,0,0,.5)";

const ONE_WORD_STYLES: CSSProperties[] = [
  { fontFamily: "system-ui,sans-serif", fontWeight: 800, color: "#fff", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 800, color: "#22d3ee", textShadow: OUTLINE },
  { fontFamily: "Georgia,serif", fontWeight: 700, color: "#fff", textShadow: "0 0 12px rgba(255,255,255,.6)" },
  { fontFamily: "Georgia,serif", fontWeight: 400, color: "#fff", textShadow: "0 0 14px rgba(255,255,255,.7)" },
  { fontFamily: "system-ui,sans-serif", fontWeight: 800, fontStyle: "italic", color: "#fff", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 900, color: "#fff", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 900, color: "#4ade80", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "Impact,system-ui,sans-serif", fontWeight: 900, fontStyle: "italic", color: "#fff", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 800, fontStyle: "italic", color: "#fff", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 900, color: "#fff", textTransform: "uppercase", background: "#ef4444", padding: "4px 18px", borderRadius: 9999 },
  { fontFamily: "Impact,system-ui,sans-serif", fontWeight: 900, color: "#fff", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 700, color: "#fff", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "Georgia,serif", fontWeight: 700, fontStyle: "italic", color: "#facc15", textShadow: "1px 1px 2px rgba(0,0,0,.6)" },
  { fontFamily: "Impact,system-ui,sans-serif", fontWeight: 900, fontStyle: "italic", color: "#facc15", textTransform: "uppercase", textShadow: "0 0 12px rgba(250,204,21,.8)" },
  { fontFamily: "system-ui,sans-serif", fontWeight: 900, color: "#facc15", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 900, color: "#3b82f6", textTransform: "uppercase", textShadow: "1px 1px 0 #fff,-1px 1px 0 #fff,1px -1px 0 #fff,-1px -1px 0 #fff" },
];

const LINE_STYLES: CSSProperties[] = [
  { fontFamily: "system-ui,sans-serif", fontWeight: 800, color: "#fff", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 800, color: "#fff", textShadow: "0 0 14px rgba(255,255,255,.7)" },
  { fontFamily: "Impact,system-ui,sans-serif", fontWeight: 900, fontStyle: "italic", color: "#3b82f6", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 700, color: "#1f2937", background: "#f3f4f6", padding: "4px 12px", borderRadius: 6 },
  { fontFamily: "Impact,system-ui,sans-serif", fontWeight: 900, color: "#fff", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "Georgia,serif", fontWeight: 700, color: "#facc15", textShadow: "0 0 12px rgba(250,204,21,.7)" },
  { fontFamily: "Impact,system-ui,sans-serif", fontWeight: 900, fontStyle: "italic", color: "#fff", textTransform: "uppercase", textShadow: "1px 1px 0 #ef4444,-1px -1px 0 #000" },
  { fontFamily: "system-ui,sans-serif", fontWeight: 900, color: "#facc15", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 800, color: "#22d3ee", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 900, color: "#84cc16", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 800, color: "#fb923c", textShadow: "0 0 12px rgba(251,146,60,.6)" },
  { fontFamily: "Impact,system-ui,sans-serif", fontWeight: 900, fontStyle: "italic", color: "#f9a8d4", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 900, color: "#fff", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 900, color: "#fff", textTransform: "uppercase", background: "#2563eb", padding: "4px 12px", borderRadius: 6 },
  { fontFamily: "system-ui,sans-serif", fontWeight: 700, color: "#fff", background: "#000", padding: "4px 12px", borderRadius: 6 },
  { fontFamily: "system-ui,sans-serif", fontWeight: 800, color: "#c4b5fd", textTransform: "uppercase", textShadow: "0 0 10px rgba(196,181,253,.6)" },
];

// ── Auth Gate Modal ──────────────────────────────────────────────────────────
function AuthModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-7 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
          <IcX />
        </button>
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <IcZap />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Create an account to proceed</h2>
          <p className="text-sm text-gray-500 mb-6">Start making videos with AI today.</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1.5">Email</label>
            <input
              type="email"
              placeholder="example@gmail.com"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-blue-400"
            />
          </div>
          <button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
            Sign up
          </button>
          <div className="flex items-center gap-3">
            <div className="h-px bg-gray-100 flex-1" />
            <span className="text-xs text-gray-400">OR</span>
            <div className="h-px bg-gray-100 flex-1" />
          </div>
          <button className="w-full border border-gray-200 text-sm font-semibold py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
            <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Continue with Google
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-4">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-600 font-semibold hover:underline">Login</Link>
        </p>
        <p className="text-center text-xs text-gray-400 mt-2">
          This is a paid-only feature. Please login and subscribe to continue.
        </p>
      </div>
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────
function Header({
  stepIndex,
  onAction,
  actionLabel,
  actionIcon,
  canProceed,
}: {
  stepIndex: number;
  onAction: () => void;
  actionLabel: string;
  actionIcon: ReactNode;
  canProceed: boolean;
}) {
  return (
    <div className="px-8 pt-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-700">
            <IcFilm />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Split Screen Video</h1>
        </div>
        <div className="flex items-center gap-4">
          <a href="/discord" aria-label="Discord" className="text-[#5865F2]"><IcDiscord /></a>
          <Link href="/login" className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors shadow-sm">
            <IcZap /> Login
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between mt-5">
        <nav className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                  style={{
                    background: i === stepIndex ? "#2563eb" : "transparent",
                    color: i === stepIndex ? "#fff" : "#9ca3af",
                    border: i === stepIndex ? "none" : "1.5px solid #d1d5db",
                  }}
                >
                  {i + 1}
                </span>
                <span className="text-sm font-semibold" style={{ color: i === stepIndex ? "#111827" : "#9ca3af" }}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <span className="text-gray-300 mx-1"><IcChevron /></span>}
            </div>
          ))}
        </nav>

        <button
          onClick={onAction}
          disabled={!canProceed}
          className="inline-flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: canProceed ? "#2563eb" : "#93c5fd" }}
        >
          {actionLabel} {actionIcon}
        </button>
      </div>
    </div>
  );
}

// ── Step 1: Upload ────────────────────────────────────────────────────────────
function UploadStep({
  onFile,
  onLinkGate,
  fileName,
  onClearFile,
}: {
  onFile: (f: File) => void;
  onLinkGate: () => void;
  fileName: string | null;
  onClearFile: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState("");

  function isValidUrl(url: string) {
    return /youtube\.com|youtu\.be|tiktok\.com/.test(url);
  }

  function handleLinkSubmit() {
    if (!link.trim()) return;
    if (!isValidUrl(link)) {
      setLinkError("Please enter a valid YouTube or TikTok link.");
      return;
    }
    setLinkError("");
    onLinkGate();
  }

  const linkValid = isValidUrl(link);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center md:bg-[#F7F7F7] md:rounded-[20px] p-4 md:p-8" style={{ minHeight: "calc(100vh - 200px)" }}>
      <div className="w-full max-w-xl flex flex-col space-y-2 rounded-lg border border-gray-200 bg-white py-4">

        <div className="px-4">
          <p className="text-base text-black">Upload your video</p>
          <p className="text-xs text-gray-500 mt-0.5">Upload a video to use for your new project.</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/mov,video/quicktime,video/webm"
          className="hidden"
          onChange={e => { if (e.target.files?.[0]) onFile(e.target.files[0]); }}
        />

        {fileName ? (
          <div className="mx-4 rounded-lg border border-blue-200 bg-blue-50 flex items-center gap-3 px-4 py-4">
            <div className="text-blue-500 flex-shrink-0"><IcFile /></div>
            <span className="text-sm font-semibold text-blue-700 flex-1 truncate">{fileName}</span>
            <button onClick={onClearFile} className="text-blue-400 hover:text-blue-600 flex-shrink-0 transition-colors">
              <IcX />
            </button>
          </div>
        ) : (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files?.[0]) onFile(e.dataTransfer.files[0]); }}
            onClick={() => inputRef.current?.click()}
            className="mx-4 flex cursor-pointer flex-col items-center justify-center space-y-3 rounded-lg border border-dashed border-gray-300 py-4 transition-all duration-300 ease-in-out md:py-8"
            style={{ borderColor: dragging ? "#93c5fd" : undefined, background: dragging ? "#eff6ff" : undefined }}
          >
            <div className="text-blue-500"><IcCloud /></div>
            <p className="text-center text-base text-gray-700">Choose a clip or drag &amp; drop it here.</p>
            <p className="text-center text-sm text-gray-400">MP4 formats, up to 50 MB.</p>
            <button
              onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
              className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 h-10"
            >
              Browse File
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 mx-4 py-1">
          <div className="h-px bg-gray-100 flex-1" />
          <span className="text-sm text-gray-500">OR</span>
          <div className="h-px bg-gray-100 flex-1" />
        </div>

        <div className="px-4">
          <p className="text-sm text-gray-500 mb-2">Add Youtube or Tiktok link</p>
          <div className="flex items-center gap-2">
            <input
              value={link}
              onChange={e => { setLink(e.target.value); setLinkError(""); }}
              onKeyDown={e => e.key === "Enter" && handleLinkSubmit()}
              placeholder="https://youtube.com/watch?v=..."
              className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none"
              style={{ borderColor: linkError ? "#fca5a5" : undefined }}
            />
            <button
              onClick={handleLinkSubmit}
              className="flex w-10 h-10 flex-row items-center justify-center rounded-md p-2 transition-all duration-300 flex-shrink-0"
              style={{
                background: linkValid ? "#335CFF" : "#F7F7F7",
                color: linkValid ? "#fff" : "#CACFD8",
                cursor: link.trim() ? "pointer" : "not-allowed",
              }}
            >
              <IcArrowRight />
            </button>
          </div>
          {linkError && <p className="text-xs text-red-500 mt-1.5">{linkError}</p>}
        </div>

      </div>
    </div>
  );
}

// ── Background card — exact Crayo reel format ────────────────────────────────
function BgCard({ b, isSel, onSelect }: { b: typeof BACKGROUNDS[0]; isSel: boolean; onSelect: () => void }) {
  const thumbUrl = `${CDN}/${b.id}/thumbnail.webp`;
  const gifUrl   = `${CDN}/${b.id}/preview.gif`;
  const premiumUrl = `https://premiumgameplay.com/explore?id=${b.id}`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={e => e.key === "Enter" && onSelect()}
      className="relative overflow-hidden rounded-lg border bg-white cursor-pointer"
      style={{ borderColor: isSel ? "#2563eb" : "#e5e7eb" }}
    >
      {/* Selected checkmark badge */}
      {isSel && (
        <div className="absolute left-3 top-3 z-30 h-5 w-5 rounded-full border border-blue-600 bg-blue-500 flex items-center justify-center">
          <IcCheck />
        </div>
      )}

      {/* Thumbnail area: 16:9 container, portrait 9:16 reel inside */}
      <div className="group relative w-full overflow-hidden" style={{ aspectRatio: "16/9", height: "176px" }}>
        {/* Blurred landscape backdrop */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover blur-lg"
          style={{ transform: "scale(1.1)" }}
          loading="lazy"
        />

        {/* Portrait reel frame centered */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative h-full" style={{ aspectRatio: "9/16" }}>
            {/* Static thumbnail */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbUrl}
              alt={b.title}
              draggable={false}
              className="h-full w-full object-cover select-none"
              loading="lazy"
            />

            {/* GIF overlay — fades in on hover */}
            <div
              className="absolute inset-0 z-20 transition-opacity duration-300"
              style={{ opacity: 0 }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "0")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={gifUrl}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover blur-lg"
                style={{ transform: "scale(1.1)" }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={gifUrl}
                alt={b.title}
                draggable={false}
                className="relative h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Info section */}
      <div className="space-y-1 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">{b.title}</h3>
          <div className="flex items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.authorImg} alt={b.author} draggable={false} className="h-5 w-5 rounded-full object-cover select-none" loading="lazy" />
            <p className="text-xs text-gray-600">{b.author}</p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="flex w-full flex-row items-start gap-1">
            <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">{b.mins}</span>
            <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">{b.size}</span>
            <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">Free</span>
          </div>
          {/* View in Premium Gameplay — opens premiumgameplay.com with the exact video ID */}
          <a
            href={premiumUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="w-full rounded-lg border border-gray-200 p-2 text-center text-sm text-gray-600 hover:text-gray-800 transition-colors block"
          >
            View in Premium Gameplay
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Step 2: Background ────────────────────────────────────────────────────────
function BackgroundStep({ selected, onSelect }: { selected: number; onSelect: (i: number) => void }) {
  return (
    <div className="px-8 pt-6 pb-10">
      <h2 className="text-lg font-bold text-gray-900">Select Background Video</h2>
      <p className="text-sm text-gray-500 mt-1.5">
        <span className="font-semibold text-gray-700">Tip:</span> You can replace the background video after generation in the editor.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mt-5">
        {BACKGROUNDS.map((b, i) => (
          <BgCard key={b.id} b={b} isSel={selected === i} onSelect={() => onSelect(i)} />
        ))}
      </div>
    </div>
  );
}

// ── Step 3: Subtitles — CSS-styled text tiles matching Crayo exactly ─────────
function SubtitleStep({ selected, onSelect }: { selected: number; onSelect: (i: number) => void }) {
  const [mode, setMode] = useState<"oneword" | "lines">("oneword");
  const styles = mode === "oneword" ? ONE_WORD_STYLES : LINE_STYLES;
  const sample = mode === "oneword" ? "Crayo" : "The quick brown";

  return (
    <div className="px-8 pt-6 pb-10">
      <h2 className="text-lg font-bold text-gray-900">Select Subtitle Template</h2>

      <div className="flex items-center gap-3 mt-3 mb-5">
        <span className="text-sm font-medium" style={{ color: mode === "oneword" ? "#111827" : "#9ca3af" }}>One Word</span>
        <button
          onClick={() => { setMode(m => m === "oneword" ? "lines" : "oneword"); onSelect(0); }}
          className="relative w-10 h-5 rounded-full transition-colors"
          style={{ background: mode === "lines" ? "#2563eb" : "#cbd5e1" }}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm"
            style={{ left: mode === "lines" ? "22px" : "2px" }}
          />
        </button>
        <span className="text-sm font-medium" style={{ color: mode === "lines" ? "#111827" : "#9ca3af" }}>Lines</span>
      </div>

      <div className="mt-4 grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {styles.map((st, i) => {
          const isSel = selected === i;
          return (
            <button
              key={i}
              onClick={() => onSelect(i)}
              className="group relative h-[104px] rounded-xl flex items-center justify-center px-4 transition-all overflow-hidden cursor-pointer"
              style={{ background: "#243044", border: isSel ? "2px solid #2563eb" : "2px solid transparent" }}
            >
              {isSel && (
                <span className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow">
                  <IcCheck />
                </span>
              )}
              <span className="text-[22px] leading-tight text-center transition-transform duration-200 group-hover:scale-110" style={st}>{sample}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main flow ─────────────────────────────────────────────────────────────────
function SplitVideoFlow() {
  const router = useRouter();
  const params = useSearchParams();

  const stepParam = params.get("step") || "upload-video";
  const stepIndex = Math.max(0, STEPS.findIndex(s => s.id === stepParam));

  // Persist file name in URL so it survives step navigation
  const fileNameParam = params.get("file") || null;
  const [fileName, setFileName] = useState<string | null>(fileNameParam);

  const [bg, setBg] = useState(0);
  const [subSel, setSubSel] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Keep fileName in sync with URL param
  useEffect(() => {
    setFileName(params.get("file") || null);
  }, [params]);

  function goTo(i: number, currentFile?: string | null) {
    const f = currentFile !== undefined ? currentFile : fileName;
    const fileQuery = f ? `&file=${encodeURIComponent(f)}` : "";
    router.push(`/dashboard/create/split-video?step=${STEPS[i].id}${fileQuery}`);
  }

  function handleFile(f: File) {
    setFileName(f.name);
    goTo(1, f.name);
  }

  function handleClearFile() {
    setFileName(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("file");
    router.replace(url.pathname + url.search);
  }

  const isLast = stepIndex === STEPS.length - 1;

  // Step 1 requires a file; steps 2–3 always ok to proceed
  const canProceed = stepIndex === 0 ? !!fileName : true;

  function handleAction() {
    if (isLast) {
      setShowAuthModal(true);
    } else {
      goTo(stepIndex + 1);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

      <ToolsSidebar active="create" />

      <main className="flex-1 overflow-y-auto bg-white">
        <Header
          stepIndex={stepIndex}
          actionLabel={isLast ? "Generate" : "Next"}
          actionIcon={isLast ? <IcSparkle /> : <IcChevron />}
          onAction={handleAction}
          canProceed={canProceed}
        />

        <div
          className="mt-4 mx-8 mb-8 rounded-[28px] bg-gray-50 border border-gray-100"
          style={{ minHeight: "calc(100vh - 200px)" }}
        >
          {stepIndex === 0 && (
            <UploadStep
              onFile={handleFile}
              onLinkGate={() => setShowAuthModal(true)}
              fileName={fileName}
              onClearFile={handleClearFile}
            />
          )}
          {stepIndex === 1 && <BackgroundStep selected={bg} onSelect={setBg} />}
          {stepIndex === 2 && (
            <SubtitleStep selected={subSel} onSelect={setSubSel} />
          )}
        </div>
      </main>
    </div>
  );
}

export default function SplitVideoPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-white" />}>
      <SplitVideoFlow />
    </Suspense>
  );
}
