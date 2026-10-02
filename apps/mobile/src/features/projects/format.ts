/** "2h ago", "Yesterday", "Sep 26" — relative to now. */
export function whenEdited(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const hours = (now - d.getTime()) / 3600_000;
  if (hours < 1) return "Just now";
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  if (hours < 48) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
