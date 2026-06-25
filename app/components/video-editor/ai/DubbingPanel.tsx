"use client";

import { useState } from "react";
import { useEditorStore } from "../store/editorStore";
import { T } from "../editorTheme";
import { mainVideoClip } from "@/lib/transcript-edit";
import { emptyAudioClipData } from "@/lib/track-editor-types";

function token() {
  return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
}

const LANGS = [
  ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["hi", "Hindi"],
  ["pt", "Portuguese"], ["it", "Italian"], ["ja", "Japanese"], ["ko", "Korean"],
  ["zh", "Chinese"], ["ar", "Arabic"], ["ru", "Russian"], ["id", "Indonesian"],
  ["nl", "Dutch"], ["tr", "Turkish"], ["pl", "Polish"], ["en", "English"],
] as const;

export default function DubbingPanel() {
  const present = useEditorStore(s => s.present);
  const addTrack = useEditorStore(s => s.addTrack);
  const addClip = useEditorStore(s => s.addClip);
  const [lang, setLang] = useState("es");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function dub() {
    const clip = mainVideoClip(present);
    if (!clip || clip.data.kind !== "video") { setMsg("Add a video first."); return; }
    setBusy(true); setMsg("Dubbing… this can take a minute or two.");
    try {
      const res = await fetch("/api/editor/dub", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ videoUrl: clip.data.url, targetLang: lang }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error ?? "Dubbing failed."); return; }
      if (data.pending) { setMsg("Still processing — try again shortly to fetch the dub."); return; }

      // Add the dubbed audio as a new audio track aligned to the source clip.
      addTrack("audio");
      const audioTrack = useEditorStore.getState().present.tracks.filter(t => t.kind === "audio").slice(-1)[0];
      if (audioTrack) {
        addClip(audioTrack.id, {
          start: clip.start, duration: clip.duration, srcIn: 0, srcOut: clip.duration,
          data: emptyAudioClipData(data.audioUrl),
        });
      }
      const label = LANGS.find(l => l[0] === lang)?.[1] ?? lang;
      setMsg(`✓ Added ${label} dub as a new audio track. Mute the original to hear it.`);
    } catch {
      setMsg("Couldn't reach the dubbing service.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg p-3" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
      <p className="text-xs font-bold mb-1" style={{ color: T.text }}>🌍 AI Dub & Translate</p>
      <p className="text-[11px] mb-2" style={{ color: T.textFaint }}>Translate your video into another language in your own voice.</p>
      <div className="flex gap-2">
        <select value={lang} onChange={e => setLang(e.target.value)} className="flex-1 rounded-lg px-2 py-1.5 text-xs outline-none" style={{ background: T.bg, color: T.text, border: `1px solid ${T.border}` }}>
          {LANGS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
        <button onClick={dub} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: T.accent, color: "#fff", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Dubbing…" : "Dub"}
        </button>
      </div>
      {msg && <p className="text-[11px] mt-2 leading-snug" style={{ color: msg.startsWith("✓") ? T.green : T.textMuted }}>{msg}</p>}
    </div>
  );
}
