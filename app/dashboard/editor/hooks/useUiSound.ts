"use client";

// Editor UI sounds — tiny synthesized blips (Web Audio, no audio files) for
// tab switches, adds, picks and finished actions, plus one sound per
// effect/filter/transition preset so the Effects panel "sounds like" what it
// does. One shared AudioContext, created lazily on the first click (browsers
// refuse to start audio before a user gesture). The mute switch is a
// per-browser preference in localStorage, read through useSyncExternalStore
// so every panel's speaker button stays in step.

import { useSyncExternalStore } from "react";

export type UiSound = "tap" | "tab" | "chip" | "add" | "pick" | "go" | "toggle" | "pop" | "undo" | "think" | "magic" | "snip";

const MUTE_KEY = "clipiro.editor.sounds.muted";
let muted = readMuted();
const listeners = new Set<() => void>();
let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;

function readMuted(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundsMuted(next: boolean) {
  muted = next;
  try {
    window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    // private mode / blocked storage — the toggle still works for this tab
  }
  listeners.forEach((l) => l());
}

export function useSoundsMuted(): [boolean, (m: boolean) => void] {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => muted,
    () => false,
  );
  return [value, setSoundsMuted];
}

function audio(): AudioContext | null {
  if (muted || typeof window === "undefined") return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(f: number, d: number, type: OscillatorType = "sine", vol = 0.05, at = 0, slideTo?: number) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + d + 0.03);
}

function noise(d: number, vol: number, f0: number, f1?: number, at = 0, q = 1.2) {
  const a = audio();
  if (!a) return;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  const t = a.currentTime + at;
  const s = a.createBufferSource();
  const fl = a.createBiquadFilter();
  const g = a.createGain();
  s.buffer = noiseBuf;
  fl.type = "bandpass";
  fl.Q.value = q;
  fl.frequency.setValueAtTime(f0, t);
  if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(fl).connect(g).connect(a.destination);
  s.start(t, Math.random() * 0.5);
  s.stop(t + d + 0.05);
}

const chord = (fs: number[], d = 0.55) => fs.forEach((f, i) => tone(f, d, "triangle", 0.035, i * 0.035));
const arp = (fs: number[], d: number, step: number, type: OscillatorType = "triangle", vol = 0.04) =>
  fs.forEach((f, i) => tone(f, d, type, vol, i * step));

const UI: Record<UiSound, () => void> = {
  tap: () => tone(880, 0.06, "triangle", 0.04),
  tab: () => {
    tone(620, 0.07, "sine", 0.05);
    tone(930, 0.1, "sine", 0.035, 0.045);
  },
  chip: () => tone(1320, 0.045, "square", 0.018),
  add: () => {
    tone(523, 0.09, "triangle", 0.05);
    tone(784, 0.14, "triangle", 0.045, 0.07);
  },
  pick: () => tone(330, 0.14, "sine", 0.06, 0, 880),
  go: () => arp([523, 659, 784, 1047], 0.22, 0.07),
  toggle: () => tone(520, 0.05, "square", 0.02),
  pop: () => {
    tone(400, 0.09, "sine", 0.08, 0, 1100);
    tone(1500, 0.05, "triangle", 0.03, 0.07);
  },
  undo: () => arp([784, 659, 523], 0.16, 0.06, "triangle", 0.035),
  think: () => [0, 1, 2, 3, 4, 5].forEach((i) => tone(1200 + (i % 3) * 300, 0.05, "sine", 0.02, i * 0.1)),
  magic: () => arp([784, 988, 1175, 1568, 1976], 0.25, 0.05, "sine", 0.035),
  snip: () => {
    tone(1800, 0.03, "square", 0.03);
    tone(900, 0.05, "square", 0.03, 0.04);
  },
};

export function playUiSound(kind: UiSound) {
  UI[kind]();
}

// Keys are the preset ids from @clipiro/shared/timeline (EFFECT_PRESETS,
// FILTER_PRESETS, TRANSITION_PRESETS); anything unlisted falls back to a tap.
const EFFECT_SOUNDS: Record<string, () => void> = {
  shake: () => [0, 1, 2, 3, 4, 5].forEach((i) => tone(i % 2 ? 150 : 195, 0.07, "sawtooth", 0.045, i * 0.06)),
  zoomPulse: () => {
    noise(0.45, 0.12, 300, 4000, 0, 2);
    tone(200, 0.45, "sine", 0.05, 0, 800);
  },
  glitch: () => Array.from({ length: 9 }, (_, i) => tone(200 + Math.random() * 1800, 0.035, "square", 0.028, i * 0.04)),
  chromaticAberration: () => Array.from({ length: 6 }, (_, i) => tone(600 + i * 120, 0.05, "sawtooth", 0.02, i * 0.03)),
  filmGrain: () => Array.from({ length: 12 }, (_, i) => noise(0.03, 0.07, 3000 + Math.random() * 4000, undefined, i * 0.045, 4)),
  bounce: () => {
    tone(260, 0.12, "sine", 0.08, 0, 520);
    tone(390, 0.1, "sine", 0.06, 0.16, 620);
    tone(520, 0.08, "sine", 0.04, 0.28, 700);
  },
  flicker: () => [0, 1, 2, 3, 4].forEach((i) => tone(1000, 0.03, "square", 0.022, i * 0.09)),
  vignettePulse: () => tone(110, 0.8, "sine", 0.1, 0, 165),
  oldFilm: () => {
    tone(60, 0.7, "sawtooth", 0.035);
    for (let i = 0; i < 8; i++) noise(0.02, 0.07, 5000, undefined, i * 0.08, 3);
  },
};

const FILTER_SOUNDS: Record<string, () => void> = {
  warm: () => chord([262, 330, 392]),
  cool: () => chord([440, 523, 659], 0.7),
  mono: () => tone(392, 0.5, "sine", 0.06),
  vivid: () => chord([523, 659, 784, 988]),
  fade: () => chord([392, 494, 587], 0.9),
  noir: () => chord([147, 175, 220], 0.8),
  sunset: () => chord([294, 370, 440], 0.6),
  tealOrange: () => chord([349, 440, 523, 659]),
  softGlow: () => arp([659, 784, 988], 0.6, 0.05, "sine", 0.03),
};

const TRANSITION_SOUNDS: Record<string, () => void> = {
  fade: () => noise(0.6, 0.08, 800, 2400, 0, 1),
  slideLeft: () => noise(0.35, 0.12, 500, 3000, 0, 2),
  slideRight: () => noise(0.35, 0.12, 3000, 500, 0, 2),
  slideUp: () => {
    noise(0.35, 0.1, 500, 3000, 0, 2);
    tone(300, 0.35, "sine", 0.03, 0, 600);
  },
  slideDown: () => {
    noise(0.35, 0.1, 3000, 500, 0, 2);
    tone(600, 0.35, "sine", 0.03, 0, 300);
  },
  zoomIn: () => {
    noise(0.4, 0.1, 300, 5000, 0, 2);
    tone(300, 0.4, "sine", 0.04, 0, 900);
  },
  zoomOut: () => {
    noise(0.4, 0.1, 5000, 300, 0, 2);
    tone(900, 0.4, "sine", 0.04, 0, 300);
  },
  wipe: () => noise(0.3, 0.12, 2000, 600, 0, 2),
  dipToBlack: () => tone(330, 0.5, "sine", 0.07, 0, 110),
};

export function playPresetSound(group: "effect" | "filter" | "transition", key: string) {
  const table = group === "effect" ? EFFECT_SOUNDS : group === "filter" ? FILTER_SOUNDS : TRANSITION_SOUNDS;
  (table[key] ?? UI.tap)();
}
