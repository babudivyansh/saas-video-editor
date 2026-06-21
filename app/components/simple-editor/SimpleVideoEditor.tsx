"use client";

import { useRef, useState, useCallback } from "react";
import { useVideoEditor } from "./useVideoEditor";
import VideoUploader from "./VideoUploader";
import VideoPlayer, { type VideoPlayerHandle } from "./VideoPlayer";
import Timeline from "./Timeline";
import ToolBar from "./ToolBar";
import CaptionsPanel from "./CaptionsPanel";
import ExportModal from "./ExportModal";
import TrimPanel from "./panels/TrimPanel";
import CropPanel from "./panels/CropPanel";
import TextOverlayPanel from "./panels/TextOverlayPanel";
import VolumePanel from "./panels/VolumePanel";
import SpeedPanel from "./panels/SpeedPanel";
import RotatePanel from "./panels/RotatePanel";
import type { TrimRange, CropSettings } from "./types";

function getToken() {
  return typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : "";
}

export default function SimpleVideoEditor() {
  const editor = useVideoEditor();
  const { state } = editor;

  const playerRef = useRef<VideoPlayerHandle>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [showExport, setShowExport] = useState(false);
  const [captionsCollapsed, setCaptionsCollapsed] = useState(false);
  const [editingName, setEditingName] = useState(false);

  const token = getToken();

  const handleTrimChange = useCallback((trim: TrimRange) => {
    editor.setTrim(trim);
  }, [editor]);

  const handleScrub = useCallback((t: number) => {
    playerRef.current?.seek(t);
    setCurrentTime(t);
  }, []);

  const handlePlaySelection = useCallback(() => {
    const v = playerRef.current?.videoEl;
    if (!v) return;
    v.currentTime = state.trim.start;
    v.play();
  }, [state.trim.start]);

  const activePanel = state.activeToolPanel;

  function renderPanel() {
    switch (activePanel) {
      case "trim":
        return (
          <TrimPanel
            trim={state.trim}
            duration={state.video?.duration ?? 0}
            onChange={handleTrimChange}
          />
        );
      case "crop":
        return (
          <CropPanel
            crop={state.crop}
            onChange={(c: CropSettings | null) => editor.setCrop(c)}
          />
        );
      case "text":
        return (
          <TextOverlayPanel
            overlays={state.textOverlays}
            onAdd={editor.addTextOverlay}
            onUpdate={editor.updateTextOverlay}
            onRemove={editor.removeTextOverlay}
          />
        );
      case "volume":
        return (
          <VolumePanel
            volume={state.volume}
            onChange={editor.setVolume}
          />
        );
      case "speed":
        return (
          <SpeedPanel
            speed={state.speed}
            onChange={editor.setSpeed}
          />
        );
      case "rotate":
        return (
          <RotatePanel
            rotation={state.rotation}
            onChange={editor.setRotation}
          />
        );
      default:
        return (
          <div className="p-4 text-xs text-gray-500">
            Select a tool from the toolbar below to open its controls here.
          </div>
        );
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#0A0A0F] text-white overflow-hidden" style={{ minWidth: 1280 }}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] bg-[#0A0A0F] shrink-0">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <svg className="w-5 h-5 text-[#7C3AED]" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path d="M15 10l4.553-2.07A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
          Simple Editor
        </div>

        <div className="w-px h-4 bg-white/10 mx-1" />

        {/* Editable project name */}
        {editingName ? (
          <input
            autoFocus
            value={state.projectName}
            onChange={e => editor.setProjectName(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={e => e.key === "Enter" && setEditingName(false)}
            className="bg-white/10 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:bg-white/15"
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="text-sm text-gray-300 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
          >
            {state.projectName}
          </button>
        )}

        <div className="flex-1" />

        {/* Undo / Redo */}
        <button
          onClick={editor.undo}
          disabled={!editor.canUndo}
          aria-label="Undo"
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-30 text-gray-300 transition-colors"
          title="Undo (Cmd+Z)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 00-4-4H4"/></svg>
        </button>
        <button
          onClick={editor.redo}
          disabled={!editor.canRedo}
          aria-label="Redo"
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-30 text-gray-300 transition-colors"
          title="Redo (Cmd+Shift+Z)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 014-4h12"/></svg>
        </button>

        {state.video && (
          <button
            onClick={() => setShowExport(true)}
            className="bg-[#7C3AED] hover:bg-[#6d28d9] text-white text-sm font-bold px-5 py-2 rounded-xl transition-colors"
          >
            Export
          </button>
        )}
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      {!state.video ? (
        <VideoUploader
          onVideo={editor.setVideo}
          token={token}
        />
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Player + side panel */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Player area */}
            <div className="flex-1 flex flex-col justify-center gap-3 px-4 py-3 min-w-0 overflow-hidden">
              <VideoPlayer
                ref={playerRef}
                state={state}
                onTimeUpdate={t => setCurrentTime(t)}
              />
            </div>

            {/* Side panel (slides in) */}
            <div className={`shrink-0 border-l border-white/[0.06] bg-[#111118] overflow-y-auto transition-all duration-150 ease-in-out ${activePanel ? "w-64" : "w-0 overflow-hidden"}`}>
              {activePanel && renderPanel()}
            </div>
          </div>

          {/* ── Timeline ───────────────────────────────────────────────── */}
          <div className="shrink-0 py-3 border-t border-white/[0.06]">
            <Timeline
              duration={state.video.duration}
              currentTime={currentTime}
              trim={state.trim}
              onTrimChange={handleTrimChange}
              onScrub={handleScrub}
              onPlaySelection={handlePlaySelection}
            />
          </div>

          {/* ── Toolbar ────────────────────────────────────────────────── */}
          <div className="shrink-0 border-t border-white/[0.06]">
            <ToolBar
              active={activePanel}
              onSelect={editor.setActiveToolPanel}
            />
          </div>

          {/* ── Captions panel ─────────────────────────────────────────── */}
          <div className="shrink-0 border-t border-white/[0.06]">
            <CaptionsPanel
              captions={state.captions}
              currentTime={currentTime}
              onUpdate={editor.updateCaption}
              onAdd={editor.addCaption}
              onRemove={editor.removeCaption}
              onReplace={editor.setCaptions}
              collapsed={captionsCollapsed}
              onToggle={() => setCaptionsCollapsed(c => !c)}
            />
          </div>
        </div>
      )}

      {/* ── Export modal ─────────────────────────────────────────────────── */}
      {showExport && (
        <ExportModal
          state={state}
          videoEl={playerRef.current?.videoEl ?? null}
          token={token}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
