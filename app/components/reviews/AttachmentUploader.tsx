"use client";

import { useRef, useState } from "react";

export interface UploadedAttachment {
  id: string;
  kind: string;
  url: string;
}

interface AttachmentUploaderProps {
  attachments: UploadedAttachment[];
  onChange: (attachments: UploadedAttachment[]) => void;
  token: string | null;
  maxCount?: number;
}

function IcCloud() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
    </svg>
  );
}
function IcTrash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
    </svg>
  );
}

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime";

export function AttachmentUploader({ attachments, onChange, token, maxCount = 5 }: AttachmentUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = maxCount - attachments.length;

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0 || !token) return;
    setError(null);
    const toUpload = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      for (const file of toUpload) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/reviews/me/attachments", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Upload failed");
          break;
        }
        onChange([...attachments, data.attachment]);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(id: string) {
    if (!token) return;
    const prev = attachments;
    onChange(attachments.filter((a) => a.id !== id));
    const res = await fetch(`/api/reviews/me/attachments/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) onChange(prev); // revert on failure
  }

  return (
    <div>
      {attachments.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-3">
          {attachments.map((a) => (
            <div key={a.id} className="relative aspect-square rounded-xl overflow-hidden border border-card-border bg-surface group">
              {a.kind === "video" ? (
                <video src={a.url} className="w-full h-full object-cover" muted />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt="" className="w-full h-full object-cover" />
              )}
              <button
                type="button"
                onClick={() => remove(a.id)}
                aria-label="Remove attachment"
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <IcTrash />
              </button>
            </div>
          ))}
        </div>
      )}

      {remaining > 0 && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => uploadFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); uploadFiles(e.dataTransfer.files); }}
            disabled={uploading}
            className={`w-full rounded-xl border transition-colors flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold cursor-pointer disabled:cursor-wait ${
              dragging ? "border-violet-300 bg-tint-violet text-accent-violet" : "border-card-border text-ink-soft hover:bg-surface"
            }`}
          >
            <IcCloud />
            {uploading ? "Uploading…" : `Add photos or a short video (${remaining} left)`}
          </button>
        </>
      )}

      {error && <p className="text-xs text-error mt-1.5">{error}</p>}
    </div>
  );
}
