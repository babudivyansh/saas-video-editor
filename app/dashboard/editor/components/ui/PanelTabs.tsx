"use client";

// The left panels' shared chrome: a title row with the UI-sound switch, the
// segmented tab bar (sliding pill via framer-motion layoutId — give each
// panel its own layoutId), and the animated screen wrapper that fades each
// tab's content in, with its rows following in a stagger (.editor-stagger in
// editor-theme.css).

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import { playUiSound, useSoundsMuted } from "../../hooks/useUiSound";

export interface PanelTab<T extends string> {
  id: T;
  label: string;
}

export function PanelHeader<T extends string>({
  title,
  tabs,
  value,
  onChange,
  layoutId,
}: {
  title: string;
  tabs?: PanelTab<T>[];
  value?: T;
  onChange?: (id: T) => void;
  layoutId?: string;
}) {
  const [muted, setMuted] = useSoundsMuted();
  return (
    <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-editor-border bg-editor-bg/95 px-3 pb-3 pt-3 backdrop-blur">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-bold text-editor-text">{title}</p>
        <button
          type="button"
          onClick={() => {
            setMuted(!muted);
            if (muted) playUiSound("toggle");
          }}
          aria-label={muted ? "Turn editor sounds on" : "Turn editor sounds off"}
          title={muted ? "Sounds off" : "Sounds on"}
          className="editor-press flex h-7 w-7 items-center justify-center rounded-editor-sm border border-editor-border text-editor-text-muted hover:border-editor-accent/50 hover:text-editor-text"
        >
          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
      </div>
      {tabs && value !== undefined && onChange && (
        <div role="tablist" aria-label={title} className="flex rounded-[9px] bg-black/40 p-[3px]">
          {tabs.map((t) => {
            const active = t.id === value;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  if (!active) playUiSound("tab");
                  onChange(t.id);
                }}
                className={`relative h-[30px] flex-1 rounded-[7px] text-[12px] font-semibold transition-colors cursor-pointer ${
                  active ? "text-editor-text" : "text-editor-text-muted hover:text-editor-text"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId={layoutId ?? `${title}-tabs`}
                    transition={{ type: "spring", stiffness: 520, damping: 34 }}
                    className="absolute inset-0 rounded-[7px] bg-editor-elevated shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_8px_rgba(0,0,0,0.4)]"
                  />
                )}
                <span className="relative">{t.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** One tab's content: fades/slides in on every switch. Panels put
 *  .editor-stagger on their own root so their rows follow in a stagger. */
export function PanelScreen({ screenKey, children, className = "" }: { screenKey: string; children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  // No exit animation on purpose: the new tab mounts straight away (waiting
  // for the old one to fade out made every switch feel laggy).
  return (
    <motion.div
      key={screenKey}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Small uppercase section label used inside panel screens. */
export function PanelSection({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-0.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-editor-text-muted">{title}</p>
        {aside}
      </div>
      {children}
    </section>
  );
}
