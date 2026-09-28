// Users have one free-form `name` (first/last were merged into it on
// 2026-09-28). Emails and in-app greetings want something short to say
// "Hi <x>" with — this is the single rule for picking it.

/** First word of the display name, or "" when there is none. */
export function greetingName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}
