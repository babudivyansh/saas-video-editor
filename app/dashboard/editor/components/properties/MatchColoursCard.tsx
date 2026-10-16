"use client";

// "Match colours": pick another video clip and this clip's fine-tune is set so
// it looks like that one (brightness, contrast, saturation, warmth). The
// server measures both clips as they look (filters included); the result is
// an ordinary fine-tune — tweak it with the sliders, or undo.

import React, { useState } from "react";
import { Loader2, Pipette } from "lucide-react";
import type { VideoAdjust, VideoClip } from "@/lib/editor/types";
import { isNeutral } from "@/lib/editor/video-look";
import { useEditorStore } from "../../store/editorStore";
import { Button, PropertyCard, SelectField } from "../ui";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function MatchColoursCard({ clip }: { clip: VideoClip }) {
  const videos = useEditorStore((s) => s.doc.tracks.video);
  const updateClip = useEditorStore((s) => s.updateClip);
  const others = videos
    .map((v, i) => ({ clip: v, label: `Clip ${i + 1} · ${fmt(v.timelineStart)}–${fmt(v.timelineStart + v.duration)}` }))
    .filter((o) => o.clip.id !== clip.id);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (others.length === 0) return null;
  const chosen = others.find((o) => o.label === pick) ?? others[0];

  const match = async () => {
    setBusy(true);
    setMessage(null);
    const side = (c: VideoClip) => ({ assetId: c.assetId, srcIn: c.srcIn, duration: c.duration * (c.speed ?? 1), filter: c.filter });
    try {
      const res = await fetch("/api/editor/color-match", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ target: side(clip), reference: { ...side(chosen.clip), adjust: chosen.clip.adjust } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't match the colours — try again.");
      const adjust = data.adjust as VideoAdjust;
      updateClip("video", clip.id, { adjust: isNeutral(adjust) ? undefined : adjust });
      const clipNo = chosen.label.split(" · ")[0];
      setMessage({ ok: true, text: isNeutral(adjust) ? `Already matches ${clipNo}.` : `Matched to ${clipNo}. Fine-tune it above, or undo.` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Couldn't match the colours — try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PropertyCard title="Match colours" collapsible={false}>
      <p className="text-[11px] leading-snug text-editor-text-muted">
        Makes this clip look like another one — handy when b-roll and the main take were shot differently.
      </p>
      <SelectField label="Look like" value={chosen.label} options={others.map((o) => o.label)} onChange={setPick} />
      <Button variant="subtle" size="sm" className="w-full gap-1.5" disabled={busy} onClick={match}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pipette className="h-3.5 w-3.5" />}
        {busy ? "Measuring both clips…" : `Match ${chosen.label.split(" · ")[0]}`}
      </Button>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-[11px] ${message.ok ? "text-editor-text-muted" : "text-error"}`}>
          {message.text}
        </p>
      )}
    </PropertyCard>
  );
}
