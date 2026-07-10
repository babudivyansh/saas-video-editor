"use client";

// Rich-text formatting toolbar for the Lexical editor mounted in the Text
// clip's Basic tab. Bold/Italic/Underline/Strikethrough and the list/emoji
// buttons dispatch Lexical's own commands; font/color/highlight apply via
// $patchStyleText to the CURRENT SELECTION ONLY (genuine per-run rich
// formatting) — distinct from the Basic tab's whole-clip Font/Size/Color
// fields, which apply to the entire editor content, see LexicalTextEditor.tsx.

import React, { useCallback, useEffect, useState } from "react";
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, Undo2, Redo2 } from "lucide-react";
import { $getSelection, $isRangeSelection, FORMAT_TEXT_COMMAND, UNDO_COMMAND, REDO_COMMAND } from "lexical";
import { $patchStyleText, $getSelectionStyleValueForProperty } from "@lexical/selection";
import { INSERT_UNORDERED_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND } from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { FONT_WHITELIST, type FontFamily } from "@/lib/editor/types";
import IconButton from "../../ui/IconButton";
import SelectField from "../../ui/SelectField";
import ColorField from "../../ui/ColorField";
import EmojiPicker from "./EmojiPicker";

interface ActiveFormats {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
}

export default function TextToolbar() {
  const [editor] = useLexicalComposerContext();
  const [active, setActive] = useState<ActiveFormats>({ bold: false, italic: false, underline: false, strikethrough: false });
  const [selectionFont, setSelectionFont] = useState<FontFamily>("Arial");
  const [selectionColor, setSelectionColor] = useState<string | null>(null);
  const [selectionHighlight, setSelectionHighlight] = useState<string | null>(null);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        setActive({
          bold: selection.hasFormat("bold"),
          italic: selection.hasFormat("italic"),
          underline: selection.hasFormat("underline"),
          strikethrough: selection.hasFormat("strikethrough"),
        });
        const font = $getSelectionStyleValueForProperty(selection, "font-family", "Arial");
        setSelectionFont((FONT_WHITELIST as readonly string[]).includes(font) ? (font as FontFamily) : "Arial");
        setSelectionColor($getSelectionStyleValueForProperty(selection, "color", "") || null);
        setSelectionHighlight($getSelectionStyleValueForProperty(selection, "background-color", "") || null);
      });
    });
  }, [editor]);

  const format = (type: "bold" | "italic" | "underline" | "strikethrough") => editor.dispatchCommand(FORMAT_TEXT_COMMAND, type);

  const patchSelectionStyle = useCallback(
    (styles: Record<string, string>) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) $patchStyleText(selection, styles);
      });
    },
    [editor],
  );

  const insertEmoji = (emoji: string) =>
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(emoji);
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-0.5">
        <IconButton icon={<Bold className="h-4 w-4" />} label="Bold" size="sm" active={active.bold} onClick={() => format("bold")} />
        <IconButton icon={<Italic className="h-4 w-4" />} label="Italic" size="sm" active={active.italic} onClick={() => format("italic")} />
        <IconButton
          icon={<Underline className="h-4 w-4" />}
          label="Underline"
          size="sm"
          active={active.underline}
          onClick={() => format("underline")}
        />
        <IconButton
          icon={<Strikethrough className="h-4 w-4" />}
          label="Strikethrough"
          size="sm"
          active={active.strikethrough}
          onClick={() => format("strikethrough")}
        />
        <span className="mx-1 h-5 w-px bg-editor-border" />
        <IconButton
          icon={<List className="h-4 w-4" />}
          label="Bullet list"
          size="sm"
          onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}
        />
        <IconButton
          icon={<ListOrdered className="h-4 w-4" />}
          label="Numbered list"
          size="sm"
          onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}
        />
        <span className="mx-1 h-5 w-px bg-editor-border" />
        <EmojiPicker onSelect={insertEmoji} />
        <span className="mx-1 h-5 w-px bg-editor-border" />
        <IconButton icon={<Undo2 className="h-4 w-4" />} label="Undo" size="sm" onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)} />
        <IconButton icon={<Redo2 className="h-4 w-4" />} label="Redo" size="sm" onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)} />
      </div>

      <SelectField label="Selection font" value={selectionFont} options={FONT_WHITELIST} onChange={(v) => patchSelectionStyle({ "font-family": v })} />
      <ColorField label="Selection color" value={selectionColor} allowNone onChange={(v) => patchSelectionStyle({ color: v ?? "" })} />
      <ColorField label="Highlight" value={selectionHighlight} allowNone onChange={(v) => patchSelectionStyle({ "background-color": v ?? "" })} />
    </div>
  );
}
