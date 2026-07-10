"use client";

// Small curated-emoji popover for the text toolbar's emoji button — local to
// the Lexical editor, not promoted to the shared ui/ kit since it's single-use.

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Smile } from "lucide-react";
import IconButton from "../../ui/IconButton";

const EMOJI = [
  "😀", "😂", "😍", "🥰", "😎", "🤔", "😢", "😭", "😡", "🥳",
  "👍", "👎", "👏", "🙌", "🙏", "💪", "✌️", "👌", "🤝", "👀",
  "🔥", "💯", "✨", "⭐", "💥", "❤️", "💔", "🎉", "🚀", "⚡",
];

export default function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <IconButton icon={<Smile className="h-4 w-4" />} label="Insert emoji" size="sm" active={open} onClick={() => setOpen((o) => !o)} />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full left-0 z-20 mt-1 grid w-48 grid-cols-6 gap-0.5 rounded-editor-md border border-editor-border bg-editor-elevated p-1.5 shadow-editor-lg"
          >
            {EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  onSelect(e);
                  setOpen(false);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-editor-sm text-base transition-colors hover:bg-editor-card cursor-pointer"
              >
                {e}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
