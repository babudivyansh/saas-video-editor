import { EmptyState } from "@/app/components/ui/EmptyState";

/** Shared "nothing connected yet" state, so every sub-route says the same thing. */
export function EmptyAccounts({
  title = "No connected accounts yet",
  subtitle = "Connect YouTube, Instagram or Facebook to see followers, reach and engagement in one place.",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <EmptyState
      icon={
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3v18h18" strokeLinecap="round" />
          <path d="m7 14 4-4 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      }
      title={title}
      subtitle={subtitle}
      // Empty states name the next action rather than only describing absence.
      action={{ label: "Connect an account", href: "/dashboard/social-tracker/settings" }}
    />
  );
}
