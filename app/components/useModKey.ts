"use client";
import { useEffect, useState } from "react";

/**
 * The shortcut modifier to show next to a key hint: "⌘" on a Mac, "Ctrl"
 * elsewhere. Read after mount so the server-rendered markup matches (same
 * approach as GlobalSearch). The tool pages used to print "⌘+Enter" for
 * everyone, which is wrong on Windows — where most users are.
 */
export function useModKey(): string {
  const [mod, setMod] = useState("Ctrl");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time platform read
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setMod("⌘");
  }, []);
  return mod;
}
