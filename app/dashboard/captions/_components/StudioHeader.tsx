"use client";

// Caption Studio's own top bar (the Studio is full screen, like the editor):
// back to the dashboard, the project name, the four steps, and a slot on the
// right for the step's own action.

import Link from "next/link";
import type { ReactNode } from "react";
import type { StudioStep } from "@/lib/captions/studio";

type StepId = "upload" | StudioStep;

const STEPS: { id: StepId; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "edit", label: "Template & edit" },
  { id: "style", label: "Style" },
  { id: "export", label: "Export" },
];

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" className="h-[11px] w-[11px]" aria-hidden="true">
    <path d="M5 12l5 5 9-10" />
  </svg>
);

export interface StudioHeaderProps {
  current: StepId;
  title?: string;
  /** Href for each step the user can go to now; a step without one is shown but not a link. */
  hrefFor?: (step: StudioStep) => string | null;
  right?: ReactNode;
}

export function StudioHeader({ current, title, hrefFor, right }: StudioHeaderProps) {
  const at = STEPS.findIndex((s) => s.id === current);
  return (
    <header className="flex h-16 flex-shrink-0 items-center gap-4 border-b border-line bg-surface-1 px-4 sm:px-6">
      <Link
        href="/dashboard"
        aria-label="Back to dashboard"
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] text-fg-muted hover:bg-surface-3 hover:text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </Link>
      <p className="hidden min-w-0 truncate text-sm text-fg-subtle md:block">
        Captions{title ? <> / <span className="text-fg">{title}</span></> : null}
      </p>

      <nav aria-label="Steps" className="mx-auto flex min-w-0 items-center gap-1 overflow-x-auto">
        {STEPS.map((s, i) => {
          const done = i < at;
          const active = i === at;
          const href = s.id !== "upload" && !active ? hrefFor?.(s.id) ?? null : null;
          const body = (
            <>
              <span
                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${
                  active ? "bg-primary text-on-primary" : done ? "bg-success/15 text-success" : "border border-line-strong text-fg-subtle"
                }`}
              >
                {done ? <Check /> : i + 1}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </>
          );
          const cls = `flex flex-shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-[13px] font-semibold ${
            active ? "bg-primary/10 text-primary" : done ? "text-success" : "text-fg-subtle"
          }`;
          return (
            <span key={s.id} className="flex items-center gap-1">
              {i > 0 && <span className={`h-px w-3 sm:w-4 ${i <= at ? "bg-success/50" : "bg-line-strong"}`} aria-hidden="true" />}
              {href ? (
                <Link href={href} className={`${cls} hover:bg-surface-3 outline-none focus-visible:ring-2 focus-visible:ring-primary/70`}>{body}</Link>
              ) : (
                <span className={cls} aria-current={active ? "step" : undefined}>{body}</span>
              )}
            </span>
          );
        })}
      </nav>

      <div className="flex flex-shrink-0 items-center gap-2">{right}</div>
    </header>
  );
}
