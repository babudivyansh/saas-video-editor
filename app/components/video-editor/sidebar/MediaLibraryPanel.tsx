"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useEditorStore } from "../store/editorStore";

interface MediaItem {
  id: string;
  name: string;
  url: string;
  duration: number;
  kind: "video" | "audio";
  thumbnail?: string;
}

function token() {
  return typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : "";
}
function authHeaders() {
  return { Authorization: `Bearer ${token()}` };
}

export default function MediaLibraryPanel() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [linkInput, setLinkInput] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addClip = useEditorStore(s => s.addClip);
  const present = useEditorStore(s => s.present);

  // Load persisted assets from API on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [vRes, aRes] = await Promise.all([
          fetch("/api/assets?kind=video&limit=100", { headers: authHeaders() }),
          fetch("/api/assets?kind=audio&limit=100", { headers: authHeaders() }),
        ]);
        if (cancelled) return;
        const vData = vRes.ok ? await vRes.json() : { assets: [] };
        const aData = aRes.ok ? await aRes.json() : { assets: [] };
        const all = [...(vData.assets ?? []), ...(aData.assets ?? [])];
        all.sort((a: { createdAt: string }, b: { createdAt: string }) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        if (!cancelled) {
          setItems(all.map((a: { id: string; name: string; url: string; duration: number | null; kind: "video" | "audio" }) => ({
            id: a.id,
            name: a.name,
            url: a.url,
            duration: a.duration ?? 30,
            kind: a.kind,
          })));
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(files)) {
        // Extract duration client-side before upload
        let clientDuration: number | undefined;
        if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
          const el = file.type.startsWith("video/") ? document.createElement("video") : document.createElement("audio");
          el.src = URL.createObjectURL(file);
          el.preload = "metadata";
          clientDuration = await new Promise<number>(resolve => {
            el.onloadedmetadata = () => { URL.revokeObjectURL(el.src); resolve((el as HTMLVideoElement).duration || 30); };
            el.onerror = () => resolve(30);
            setTimeout(() => resolve(30), 4000);
          });
        }
        const fd = new FormData();
        fd.append("file", file);
        if (clientDuration) fd.append("duration", String(clientDuration));
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${token()}` },
          body: fd,
        });
        if (res.status === 401) {
          setUploadError("Session expired — please log in again.");
          return;
        }
        if (!res.ok) {
          setUploadError(`Upload failed (${res.status})`);
          continue;
        }
        const data = await res.json();
        const kind = file.type.startsWith("audio") ? "audio" : "video";
        const item: MediaItem = {
          id: data.asset?.id ?? crypto.randomUUID(),
          name: file.name,
          url: data.url,
          duration: data.asset?.duration ?? clientDuration ?? 30,
          kind,
        };
        setItems(prev => [item, ...prev]);
      }
    } finally {
      setUploading(false);
    }
  }, []);

  const handleImportLink = useCallback(async () => {
    if (!linkInput.trim()) return;
    setImporting(true);
    try {
      const res = await fetch("/api/editor/import-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ url: linkInput.trim() }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const item: MediaItem = {
        id: crypto.randomUUID(),
        name: new URL(linkInput).hostname,
        url: data.url ?? linkInput,
        duration: data.duration ?? 30,
        kind: "video",
      };
      setItems(prev => [item, ...prev]);
      setLinkInput("");
    } finally {
      setImporting(false);
    }
  }, [linkInput]);

  const addToTimeline = useCallback((item: MediaItem) => {
    const videoTracks = present.tracks.filter(t => t.kind === item.kind);
    if (videoTracks.length === 0) return;
    const track = videoTracks[0];
    // Calculate next start position (end of last clip)
    const lastEnd = track.clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0);
    if (item.kind === "video") {
      addClip(track.id, {
        start: lastEnd,
        duration: item.duration,
        srcIn: 0,
        srcOut: item.duration,
        data: {
          kind: "video",
          url: item.url,
          posX: 0.5, posY: 0.5,
          scaleX: 1, scaleY: 1,
          rotation: 0, opacity: 1, blur: 0, speed: 1,
          brightness: 1, contrast: 1, saturation: 1,
          effects: [],
        },
      });
    } else {
      addClip(track.id, {
        start: lastEnd,
        duration: item.duration,
        srcIn: 0,
        srcOut: item.duration,
        data: { kind: "audio", url: item.url, volume: 1, fadeIn: 0, fadeOut: 0, muted: false },
      });
    }
  }, [present.tracks, addClip]);

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Auth / upload error */}
      {uploadError && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
          style={{ background: "#3f1515", border: "1px solid #7f1d1d", color: "#fca5a5" }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
          {uploadError}
        </div>
      )}
      {/* Upload zone */}
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-lg cursor-pointer transition-all"
        style={{ border: "2px dashed #e4e7ec", padding: "20px 12px", background: uploading ? "#e4e7ec" : "transparent" }}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); }}
        onDrop={e => { e.preventDefault(); handleFileUpload(e.dataTransfer.files); }}
      >
        {uploading ? (
          <div className="flex items-center gap-2">
            <Spinner />
            <span className="text-xs" style={{ color: "#5a6170" }}>Uploading…</span>
          </div>
        ) : (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="#98a0ae" strokeWidth={1.5} className="w-7 h-7">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round" />
              <polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round" />
            </svg>
            <span className="text-xs text-center" style={{ color: "#5a6170" }}>
              Drop video/audio here<br />or <span style={{ color: "#335cff" }}>browse</span>
            </span>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="video/*,audio/*"
          multiple
          className="hidden"
          onChange={e => handleFileUpload(e.target.files)}
        />
      </div>

      {/* Import link */}
      <div className="flex gap-1.5">
        <input
          type="url"
          placeholder="YouTube / URL…"
          value={linkInput}
          onChange={e => setLinkInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleImportLink()}
          className="flex-1 rounded-md px-2 py-1 text-xs outline-none"
          style={{ background: "#f6f7f9", border: "1px solid #e4e7ec", color: "#15181f" }}
        />
        <button
          onClick={handleImportLink}
          disabled={importing || !linkInput.trim()}
          className="px-2 py-1 rounded-md text-xs font-medium transition-colors"
          style={{ background: "#335cff", color: "white" }}
        >
          {importing ? "…" : "Import"}
        </button>
      </div>

      {/* Media items grid */}
      {!loaded ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-xs" style={{ color: "#d3d8e0" }}>No media yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {items.map(item => (
            <MediaCard key={item.id} item={item} onAdd={() => addToTimeline(item)} />
          ))}
        </div>
      )}
    </div>
  );
}

function MediaCard({ item, onAdd }: { item: MediaItem; onAdd: () => void }) {
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      "application/video-editor-clip",
      JSON.stringify({ url: item.url, duration: item.duration, kind: item.kind }),
    );
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex items-center gap-2 rounded-lg px-2 py-2 cursor-grab transition-all group"
      style={{ background: "#e4e7ec", border: "1px solid #e4e7ec" }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = "#d3d8e0")}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = "#e4e7ec")}
    >
      {/* Icon */}
      <div
        className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0"
        style={{ background: item.kind === "video" ? "#e8edff" : "#d1fae5" }}
      >
        {item.kind === "video" ? (
          <svg viewBox="0 0 24 24" fill="#335cff" className="w-4 h-4">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="#15a66b" className="w-4 h-4">
            <path d="M9 18V5l12-2v13" strokeLinecap="round" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: "#15181f" }}>{item.name}</p>
        <p className="text-xs" style={{ color: "#98a0ae" }}>{fmtDur(item.duration)}</p>
      </div>

      {/* Add button */}
      <button
        onClick={e => { e.stopPropagation(); onAdd(); }}
        className="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded flex items-center justify-center"
        style={{ background: "#335cff", color: "white" }}
        title="Add to timeline"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5">
          <line x1="12" y1="5" x2="12" y2="19" strokeLinecap="round" />
          <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function fmtDur(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function Spinner() {
  return (
    <div
      className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
      style={{ borderColor: "#3b82f6", borderTopColor: "transparent" }}
    />
  );
}

async function getMediaDuration(url: string): Promise<number> {
  return new Promise(resolve => {
    const el = document.createElement("video");
    el.src = url;
    el.preload = "metadata";
    el.onloadedmetadata = () => resolve(el.duration || 30);
    el.onerror = () => resolve(30);
    setTimeout(() => resolve(30), 5000);
  });
}
