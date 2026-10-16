"use client";

// Shown in the stage area while a project has nothing in it: drop or upload a
// video (it lands on the timeline straight away), pick one from Assets or
// stock, choose where it will be posted, or reuse a recent upload.

import React, { useRef, useState } from "react";
import { Film, FolderOpen, Loader2, UploadCloud } from "lucide-react";
import type { Aspect } from "@/lib/editor/types";
import { useEditorStore } from "../store/editorStore";
import { type AssetRow, fmtDuration, useAssets, useUpload } from "./panels/shared/assetData";
import { addAssetToTimeline } from "./panels/shared/addAssetToTimeline";
import { Button } from "./ui";

const ASPECTS: { value: Aspect; label: string; hint: string; box: string }[] = [
  { value: "9:16", label: "9:16", hint: "Shorts, Reels, TikTok", box: "h-8 w-[18px]" },
  { value: "1:1", label: "1:1", hint: "Feed posts", box: "h-6 w-6" },
  { value: "16:9", label: "16:9", hint: "YouTube", box: "h-[18px] w-8" },
];

export default function EmptyProjectStart() {
  const aspect = useEditorStore((s) => s.doc.aspect);
  const setAspect = useEditorStore((s) => s.setAspect);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const { assets } = useAssets("video");
  const [adding, setAdding] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const add = async (asset: AssetRow) => {
    setAdding(asset.id);
    setAddError(null);
    try {
      await addAssetToTimeline(asset);
    } catch {
      setAddError("Couldn't read that file. Try another one.");
    } finally {
      setAdding(null);
    }
  };

  const { upload, uploading, error } = useUpload((asset) => {
    if (asset) void add(asset);
  });

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void upload(file);
  };

  const recent = assets.slice(0, 3);
  const busy = uploading || adding !== null;
  const message = error ?? addError;

  return (
    <div className="flex min-h-0 w-full flex-1 justify-center overflow-y-auto">
      <div className="my-auto flex w-full max-w-[560px] flex-col gap-5 py-4">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-editor-text">Start your video</h2>
          <p className="mt-1 text-[13px] text-editor-text-muted">Add a clip and it goes straight onto the timeline.</p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center gap-3 rounded-editor-lg border border-dashed px-6 py-6 text-center transition-colors ${
            dragOver ? "border-editor-accent bg-editor-accent/10" : "border-editor-border bg-editor-card"
          }`}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-editor-accent/15 text-editor-accent">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
          </span>
          <div>
            <p className="text-sm font-medium text-editor-text">
              {uploading ? "Uploading…" : adding ? "Adding to the timeline…" : "Drop a video here"}
            </p>
            <p className="mt-0.5 text-[12px] text-editor-text-faint">MP4, MOV or WebM — images and audio work too</p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="video/*,image/*,audio/*"
            className="hidden"
            onChange={(e) => {
              onFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" disabled={busy} onClick={() => fileInput.current?.click()}>
              Upload a file
            </Button>
            <Button variant="subtle" className="gap-1.5" onClick={() => setActivePanel("media")}>
              <FolderOpen className="h-3.5 w-3.5" /> Choose from Assets
            </Button>
            <Button variant="subtle" className="gap-1.5" onClick={() => setActivePanel("video")}>
              <Film className="h-3.5 w-3.5" /> Browse stock video
            </Button>
          </div>
          {message && (
            <p role="alert" className="text-[12px] text-error">
              {message}
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-[12px] font-medium text-editor-text-muted">Where will you post it?</p>
          <div role="radiogroup" aria-label="Video shape" className="grid grid-cols-3 gap-2">
            {ASPECTS.map((a) => {
              const on = aspect === a.value;
              return (
                <button
                  key={a.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`${a.label} · ${a.hint}`}
                  onClick={() => setAspect(a.value)}
                  className={`flex flex-col items-center gap-1.5 rounded-editor-md border px-2 py-3 ${
                    on ? "border-editor-accent bg-editor-accent/10" : "border-editor-border bg-editor-card hover:bg-editor-elevated"
                  }`}
                >
                  <span className={`${a.box} rounded-[3px] border-2 ${on ? "border-editor-accent" : "border-editor-text-faint"}`} aria-hidden="true" />
                  <span className="text-[13px] font-semibold text-editor-text">{a.label}</span>
                  <span className="text-[11px] text-editor-text-faint">{a.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        {recent.length > 0 && (
          <div>
            <p className="mb-2 text-[12px] font-medium text-editor-text-muted">Recent uploads</p>
            <div className="grid grid-cols-3 gap-2">
              {recent.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  disabled={busy}
                  onClick={() => add(a)}
                  title={`Add ${a.name}`}
                  className="group relative aspect-video overflow-hidden rounded-editor-md border border-editor-border bg-black disabled:opacity-50"
                >
                  <video src={a.url} preload="metadata" muted className="h-full w-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-left text-[11px] text-white">
                    {a.name}
                  </span>
                  {a.duration != null && (
                    <span className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">{fmtDuration(a.duration)}</span>
                  )}
                  {adding === a.id && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
