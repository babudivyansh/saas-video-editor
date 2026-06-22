"use client";

import { useState, useCallback } from "react";
import { useEditorStore } from "../store/editorStore";
import { CAPTION_STYLES } from "@/lib/caption-styles";
import type { CaptionSegment } from "@/lib/track-editor-types";

function token() {
  return typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : "";
}

export default function CaptionStudio() {
  const setCaptionStudioOpen = useEditorStore(s => s.setCaptionStudioOpen);
  const present = useEditorStore(s => s.present);
  const addClip = useEditorStore(s => s.addClip);
  const addTrack = useEditorStore(s => s.addTrack);

  const [loading, setLoading] = useState(false);
  const [segments, setSegments] = useState<CaptionSegment[]>([]);
  const [styleIdx, setStyleIdx] = useState(0);
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState(false);

  // Get the first video URL from the doc
  const videoUrl = present.tracks
    .flatMap(t => t.clips)
    .find(c => c.data.kind === "video")
    ?.data.kind === "video"
    ? (present.tracks.flatMap(t => t.clips).find(c => c.data.kind === "video")!.data as { url: string }).url
    : null;

  const generate = useCallback(async () => {
    if (!videoUrl) { setError("Add a video clip first."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/editor/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ videoUrl }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Transcription failed"); return; }
      const segs: CaptionSegment[] = (data.segments ?? []).map((s: { word: string; start: number; end: number }) => ({
        word: s.word,
        start: s.start,
        end: s.end,
      }));
      setSegments(segs);
      setGenerated(true);
      if (data.warning) setError(data.warning);
    } catch {
      setError("Failed to connect to transcription service.");
    } finally {
      setLoading(false);
    }
  }, [videoUrl]);

  const applyToTimeline = useCallback(() => {
    if (segments.length === 0) return;
    const style = CAPTION_STYLES[styleIdx];

    // Find or create a text track
    let textTrack = present.tracks.find(t => t.kind === "text");
    if (!textTrack) {
      addTrack("text");
      // The new track will be added after this call; we approximate
      textTrack = present.tracks.find(t => t.kind === "text");
    }
    if (!textTrack) return;

    // Group words into 5-word chunks with their timing
    const chunks: CaptionSegment[][] = [];
    for (let i = 0; i < segments.length; i += 5) {
      chunks.push(segments.slice(i, i + 5));
    }

    for (const chunk of chunks) {
      const start = chunk[0].start / 1000; // ms → s
      const end = chunk[chunk.length - 1].end / 1000;
      const text = chunk.map(s => s.word).join(" ");
      addClip(textTrack.id, {
        start,
        duration: end - start,
        srcIn: start,
        srcOut: end,
        data: {
          kind: "text",
          text,
          fontFamily: style.fontFamily,
          fontSize: 64,
          color: style.color,
          backgroundColor: "transparent",
          backgroundOpacity: 0,
          bold: style.weight >= 700,
          italic: style.italic ?? false,
          uppercase: style.uppercase ?? false,
          posX: 0.5,
          posY: 0.8,
          animation: "fade-in",
          stroke: true,
          strokeColor: "#000000",
          strokeWidth: 3,
          shadow: false,
          shadowColor: "#000000",
        },
      });
    }

    setCaptionStudioOpen(false);
  }, [segments, styleIdx, present.tracks, addClip, addTrack, setCaptionStudioOpen]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
      <div className="flex flex-col rounded-2xl shadow-2xl overflow-hidden" style={{ width: 520, maxHeight: "80vh", background: "#18181b", border: "1px solid #27272a" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #27272a" }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: "#e4e4e7" }}>AI Caption Studio</h2>
            <p className="text-xs mt-0.5" style={{ color: "#52525b" }}>Powered by Whisper · Word-level timestamps</p>
          </div>
          <button onClick={() => setCaptionStudioOpen(false)} style={{ color: "#71717a" }} className="hover:text-white transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
              <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* Step 1: Generate */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "#1e3a5f", color: "#60a5fa" }}>1</div>
              <span className="text-sm font-medium" style={{ color: "#e4e4e7" }}>Generate Transcript</span>
            </div>
            {error && <p className="text-xs mb-2" style={{ color: "#f87171" }}>{error}</p>}
            <button
              onClick={generate}
              disabled={loading || !videoUrl}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: loading ? "#1e3a5f" : "#2563eb",
                color: "white",
                opacity: !videoUrl ? 0.5 : 1,
                cursor: !videoUrl ? "not-allowed" : "pointer",
              }}
            >
              {loading ? (
                <>
                  <Spinner />
                  Transcribing…
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                    <path d="M12 8v4l3 3" strokeLinecap="round" />
                  </svg>
                  {generated ? "Re-generate" : "Generate Captions"}
                </>
              )}
            </button>
          </div>

          {/* Generated transcript preview */}
          {segments.length > 0 && (
            <div className="rounded-lg p-3 max-h-40 overflow-y-auto" style={{ background: "#111113", border: "1px solid #27272a" }}>
              <p className="text-xs leading-relaxed" style={{ color: "#a1a1aa" }}>
                {segments.map(s => s.word).join(" ")}
              </p>
            </div>
          )}

          {/* Step 2: Pick style */}
          {generated && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "#1e3a5f", color: "#60a5fa" }}>2</div>
                <span className="text-sm font-medium" style={{ color: "#e4e4e7" }}>Choose Caption Style</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {CAPTION_STYLES.map((style, i) => (
                  <button
                    key={i}
                    onClick={() => setStyleIdx(i)}
                    className="flex flex-col items-center justify-center rounded-lg py-2 px-1 transition-all"
                    style={{
                      background: styleIdx === i ? "#1e3a5f" : "#111113",
                      border: `1px solid ${styleIdx === i ? "#2563eb" : "#27272a"}`,
                    }}
                  >
                    <span style={{ color: style.color, fontFamily: style.fontFamily, fontSize: 10, fontWeight: style.weight }}>
                      WORD
                    </span>
                    <span style={{ color: "#52525b", fontSize: 8, marginTop: 2 }}>{style.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: "1px solid #27272a" }}>
          <button onClick={() => setCaptionStudioOpen(false)} className="px-4 py-1.5 rounded-lg text-sm transition-colors" style={{ color: "#71717a" }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#e4e4e7")}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#71717a")}
          >
            Cancel
          </button>
          <button
            onClick={applyToTimeline}
            disabled={segments.length === 0}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: segments.length === 0 ? "#27272a" : "#2563eb",
              color: segments.length === 0 ? "#52525b" : "white",
              cursor: segments.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            Apply to Timeline
          </button>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "white", borderTopColor: "transparent" }} />;
}
