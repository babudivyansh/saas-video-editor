"use client";

import { useEffect, useState } from "react";
import { useSimpleEditorStore } from "./store/simpleEditorStore";

const STEPS = [
  { label: "Uploading video",        icon: "⬆", detail: "Saving your video securely…" },
  { label: "Extracting audio",       icon: "🎙", detail: "Pulling speech from your clip…" },
  { label: "Transcribing speech",    icon: "✦", detail: "Detecting words & timings…" },
  { label: "Analyzing viral potential", icon: "⚡", detail: "Scoring hook, pacing & energy…" },
];

export default function AnalyzingScreen() {
  const analysisStep = useSimpleEditorStore(s => s.analysisStep);
  const [displayStep, setDisplayStep] = useState(0);

  const stepIndex =
    analysisStep === "uploading"   ? 0 :
    analysisStep === "transcribing" ? 2 :
    analysisStep === "analyzing"    ? 3 : 1;

  useEffect(() => {
    if (stepIndex > displayStep) setDisplayStep(stepIndex);
  }, [stepIndex, displayStep]);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-50"
      style={{ background: "#0A0A0F" }}
    >
      {/* Animated ring */}
      <div className="relative w-24 h-24 mb-10">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r="44" fill="none" stroke="rgba(124,58,237,0.15)" strokeWidth="8" />
          <circle
            cx="48" cy="48" r="44"
            fill="none"
            stroke="#7C3AED"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 44}`}
            strokeDashoffset={`${2 * Math.PI * 44 * (1 - (displayStep + 1) / STEPS.length)}`}
            style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-3xl">
          {STEPS[displayStep]?.icon}
        </div>
      </div>

      <h2 className="text-2xl font-bold text-white mb-2">Your video is being optimized</h2>
      <p className="text-sm mb-10" style={{ color: "#6b7280" }}>
        AI is analyzing your video for viral potential…
      </p>

      {/* Steps */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {STEPS.map((step, i) => {
          const done = i < displayStep;
          const active = i === displayStep;
          return (
            <div
              key={step.label}
              className="flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-300"
              style={{
                background: active ? "rgba(124,58,237,0.12)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${active ? "rgba(124,58,237,0.35)" : "rgba(255,255,255,0.05)"}`,
                opacity: i > displayStep ? 0.35 : 1,
              }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-all"
                style={{
                  background: done ? "#7C3AED" : active ? "rgba(124,58,237,0.3)" : "rgba(255,255,255,0.05)",
                  color: done || active ? "#fff" : "#4b5563",
                }}
              >
                {done ? "✓" : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: active ? "#e5e7eb" : done ? "#9ca3af" : "#4b5563" }}>
                  {step.label}
                </p>
                {active && (
                  <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>{step.detail}</p>
                )}
              </div>
              {active && (
                <div
                  className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin flex-shrink-0"
                  style={{ borderColor: "#7C3AED", borderTopColor: "transparent" }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
