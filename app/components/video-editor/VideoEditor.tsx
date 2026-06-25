"use client";

import EditorLayout from "./layout/EditorLayout";
import { useEditorStore } from "./store/editorStore";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useAutoSave } from "./hooks/useAutoSave";
import ExportModal from "./export/ExportModal";
import CaptionStudio from "./ai/CaptionStudio";
import ReelsOptimizer from "./ai/ReelsOptimizer";
import AICopilotPanel from "./ai/AICopilotPanel";
import AutoEditSuggestions from "./ai/AutoEditSuggestions";
import SmartReframe from "./ai/SmartReframe";
import CommandPalette from "./layout/CommandPalette";
import ShortcutsModal from "./layout/ShortcutsModal";

export default function VideoEditor() {
  useKeyboardShortcuts();
  useAutoSave();

  const exportModalOpen = useEditorStore(s => s.exportModalOpen);
  const captionStudioOpen = useEditorStore(s => s.captionStudioOpen);
  const reelsOptimizerOpen = useEditorStore(s => s.reelsOptimizerOpen);
  const aiCopilotOpen = useEditorStore(s => s.aiCopilotOpen);
  const autoEditOpen = useEditorStore(s => s.autoEditOpen);
  const smartReframeOpen = useEditorStore(s => s.smartReframeOpen);

  return (
    <>
      <EditorLayout />
      {exportModalOpen && <ExportModal />}
      {captionStudioOpen && <CaptionStudio />}
      {reelsOptimizerOpen && <ReelsOptimizer />}
      {aiCopilotOpen && <AICopilotPanel />}
      {autoEditOpen && <AutoEditSuggestions />}
      {smartReframeOpen && <SmartReframe />}
      <CommandPalette />
      <ShortcutsModal />
    </>
  );
}
