"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";

interface FeatureHintProps {
  hintId: string;
  title: string;
  body: string;
  cta: { label: string; href: string };
}

function IcSparkle() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6L12 2z"/></svg>;
}
function IcClose() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5"><path d="M18 6L6 18M6 6l12 12"/></svg>;
}

export function FeatureHint({ hintId, title, body, cta }: FeatureHintProps) {
  const { token } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  function handleDismiss() {
    setDismissed(true);
    if (!token) return;
    fetch("/api/onboarding/hints/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ hintId }),
    }).catch(() => {});
  }

  if (dismissed) return null;

  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-violet-100 bg-tint-violet px-4 py-3.5">
      <span className="mt-0.5 flex-shrink-0 text-accent-violet"><IcSparkle /></span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">{body}</p>
        <Link href={cta.href} className="inline-block mt-2 text-xs font-semibold text-accent-violet hover:text-brand transition-colors">
          {cta.label} →
        </Link>
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="flex-shrink-0 text-ink-soft/50 hover:text-ink-soft transition-colors p-1"
      >
        <IcClose />
      </button>
    </div>
  );
}
