"use client";
import { useRef, useState, type ReactNode } from "react";

interface Props {
  icon: ReactNode;
  title: string;
  subtitle: string;
  uploadTitle: string;
  fileTypes: string;
  acceptAttr: string;
  buttonLabel: string;
  shortcut?: string;
  apiEndpoint: string;
  outputFilename: string;
}

function IcCloud() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function FreeToolUploader({ icon, title, subtitle, uploadTitle, fileTypes, acceptAttr, buttonLabel, shortcut, apiEndpoint, outputFilename }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onPick(f: FileList | null) {
    if (f && f.length > 0) { setFile(f[0]); setError(null); }
  }

  async function handleProcess() {
    if (!file || processing) return;
    setProcessing(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(apiEndpoint, { method: "POST", body: form });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(json.error ?? `Server error (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outputFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] px-8 pb-10">
      <div className="rounded-[28px] bg-gray-50 border border-gray-100 flex items-center justify-center p-8" style={{ minHeight: "calc(100vh - 132px)" }}>
        <div className="w-full max-w-[560px] bg-white rounded-2xl border border-gray-200 shadow-sm p-5">

          {/* Header */}
          <div className="flex items-start gap-3 pb-4 border-b border-gray-100">
            <div className="w-11 h-11 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 flex-shrink-0">
              {icon}
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-gray-900 text-[17px] leading-tight">{title}</h2>
              <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
            </div>
          </div>

          {/* Dropzone */}
          <input ref={inputRef} type="file" accept={acceptAttr} className="hidden" onChange={e => onPick(e.target.files)} />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); onPick(e.dataTransfer.files); }}
            className="mt-4 w-full rounded-xl border transition-colors flex flex-col items-center justify-center text-center px-6 py-10"
            style={{
              borderColor: dragging ? "#93c5fd" : "#e5e7eb",
              background: dragging ? "#eff6ff" : "#ffffff",
            }}
          >
            <div className="w-12 h-12 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 mb-3">
              <IcCloud />
            </div>
            {file ? (
              <>
                <p className="text-[15px] font-semibold text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-400 mt-1">{(file.size / (1024 * 1024)).toFixed(1)} MB · click to replace</p>
              </>
            ) : (
              <>
                <p className="text-[15px] font-semibold text-gray-900">{uploadTitle}</p>
                <p className="text-sm text-gray-400 mt-1">Drag and drop or click to browse</p>
                <p className="text-xs text-gray-400 mt-2">{fileTypes} • Max 5 GB</p>
              </>
            )}
          </button>

          {error && (
            <p className="mt-3 text-sm text-red-500 text-center">{error}</p>
          )}

          {/* Action */}
          <button
            type="button"
            disabled={!file || processing}
            onClick={handleProcess}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 text-white text-sm font-semibold py-3 rounded-xl transition-colors"
            style={{
              background: file && !processing ? "#2563eb" : "#a5b4fc",
              cursor: file && !processing ? "pointer" : "not-allowed",
            }}
          >
            {processing ? <><Spinner /> Processing…</> : (
              <>
                {buttonLabel}
                {shortcut && (
                  <span className="text-[11px] font-medium bg-white/20 rounded px-1.5 py-0.5">{shortcut}</span>
                )}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
