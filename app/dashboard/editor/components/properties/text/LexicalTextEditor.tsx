"use client";

// Mounts the Lexical rich text editor for the selected TextClip's Basic tab.
// Hydrates from clip.richText (or once from legacy clip.text for clips
// created before this field existed), syncs edits back to the store
// (debounced), and focuses itself when the store's focusTextClipId requests
// it — set by "Add Text" quick actions and double-clicking the clip on the
// canvas preview (see PreviewStage.tsx). Mounted only here, never on canvas —
// see the plan's note on why (avoids a select-vs-edit pointer-mode conflict
// on the draggable canvas overlay).

import React, { useEffect, useRef } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ListNode, ListItemNode } from "@lexical/list";
import { $getRoot, $createParagraphNode, $createTextNode, type EditorState } from "lexical";
import { useEditorStore } from "../../../store/editorStore";
import type { RichTextState, TextClip } from "@/lib/editor/types";
import TextToolbar from "./TextToolbar";

// Hydrates the editor from the clip's saved content exactly once per clip
// selection — re-running on every store update would clobber in-progress
// typing with the (now-stale) props snapshot.
function InitialStatePlugin({ clip }: { clip: TextClip }) {
  const [editor] = useLexicalComposerContext();
  const hydratedFor = useRef<string | null>(null);

  useEffect(() => {
    if (hydratedFor.current === clip.id) return;
    hydratedFor.current = clip.id;

    if (clip.richText) {
      try {
        const state = editor.parseEditorState(JSON.stringify(clip.richText));
        editor.setEditorState(state);
        return;
      } catch {
        // malformed/legacy richText — fall through to plain-text hydration
      }
    }
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      const p = $createParagraphNode();
      p.append($createTextNode(clip.text));
      root.append(p);
    });
    // Only clip.id should re-trigger hydration; richText/text changes from
    // this editor's own typing must not re-hydrate mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.id, editor]);

  return null;
}

function FocusRequestPlugin({ clipId }: { clipId: string }) {
  const [editor] = useLexicalComposerContext();
  const focusTextClipId = useEditorStore((s) => s.focusTextClipId);
  const clearTextFocus = useEditorStore((s) => s.clearTextFocus);

  useEffect(() => {
    if (focusTextClipId !== clipId) return;
    editor.focus();
    clearTextFocus();
  }, [focusTextClipId, clipId, editor, clearTextFocus]);

  return null;
}

function SyncPlugin({ clipId }: { clipId: string }) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (editorState: EditorState) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const richText = editorState.toJSON() as unknown as RichTextState;
      const text = editorState.read(() => $getRoot().getTextContent());
      updateClip("text", clipId, { richText, text }, false);
    }, 150);
  };

  return <OnChangePlugin onChange={handleChange} />;
}

const theme = {
  text: { bold: "font-bold", italic: "italic", underline: "underline", strikethrough: "line-through" },
  list: { ul: "list-disc pl-5 m-0", ol: "list-decimal pl-5 m-0" },
};

export default function LexicalTextEditor({ clip }: { clip: TextClip }) {
  const updateClip = useEditorStore((s) => s.updateClip);
  // Commits one doc-level undo step for the whole editing session on blur —
  // same pattern the old plain textarea used (patch({}, false) while typing,
  // patch({}, true) on blur).
  const commit = () => updateClip("text", clip.id, {}, true);

  return (
    <LexicalComposer
      initialConfig={{
        namespace: "clipiro-text",
        nodes: [ListNode, ListItemNode],
        theme,
        onError: (error) => console.error("Lexical editor error:", error),
      }}
    >
      <div className="flex flex-col gap-1.5">
        <TextToolbar />
        <div
          onBlur={commit}
          className="relative rounded-editor-sm border border-editor-border bg-editor-elevated outline-none transition-colors focus-within:border-editor-accent"
        >
          <RichTextPlugin
            contentEditable={
              <ContentEditable className="min-h-[4.5em] w-full whitespace-pre-wrap px-2 py-1.5 text-xs text-editor-text outline-none" />
            }
            placeholder={<div className="pointer-events-none absolute left-2 top-1.5 text-xs text-editor-text-faint">Type something…</div>}
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <HistoryPlugin />
        <ListPlugin />
        <InitialStatePlugin clip={clip} />
        <FocusRequestPlugin clipId={clip.id} />
        <SyncPlugin clipId={clip.id} />
      </div>
    </LexicalComposer>
  );
}
