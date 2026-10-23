"use client";

// One place that turns an "AI tools" operation into new text: the free,
// deterministic ones run here in the browser; the model-backed ones call
// /api/editor/ai-text (free under a daily fair-use cap — lib/fair-use.ts).

import { useCallback, useState } from "react";
import { addEmojisToText, autoLineBreaks, removeFillerWords, type AiTextOperation, isLlmOperation } from "@/lib/editor/ai-text";
import { clientAuthToken } from "@/lib/client-session";

export const AI_TEXT_ACTIONS: { op: AiTextOperation; label: string; free?: boolean }[] = [
  { op: "rewrite", label: "Rewrite" },
  { op: "grammar", label: "Fix grammar" },
  { op: "shorten", label: "Shorten" },
  { op: "expand", label: "Expand" },
  { op: "readability", label: "Easier to read" },
  { op: "viral", label: "Make it punchy" },
  { op: "translate", label: "Translate" },
  { op: "fillerWords", label: "Remove filler words", free: true },
  { op: "emojis", label: "Add emojis", free: true },
  { op: "lineBreaks", label: "Auto line breaks", free: true },
];

export function applyFreeOperation(op: AiTextOperation, text: string): string | null {
  if (op === "fillerWords") return removeFillerWords(text);
  if (op === "emojis") return addEmojisToText(text);
  if (op === "lineBreaks") return autoLineBreaks(text);
  return null;
}

export function useAiText() {
  const [working, setWorking] = useState<AiTextOperation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (op: AiTextOperation, text: string, targetLang?: string): Promise<string | null> => {
    setError(null);
    if (!text.trim()) { setError("There's no text to change."); return null; }
    const local = applyFreeOperation(op, text);
    if (local !== null) return local;
    if (!isLlmOperation(op)) return null;
    setWorking(op);
    try {
      const res = await fetch("/api/editor/ai-text", {
        method: "POST",
        headers: { Authorization: `Bearer ${clientAuthToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ operation: op, text, targetLang }),
      });
      const data = (await res.json().catch(() => ({}))) as { result?: string; error?: string };
      if (!res.ok || !data.result) throw new Error(data.error ?? "AI request failed — try again");
      return data.result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI request failed — try again");
      return null;
    } finally {
      setWorking(null);
    }
  }, []);

  return { run, working, error, setError };
}
