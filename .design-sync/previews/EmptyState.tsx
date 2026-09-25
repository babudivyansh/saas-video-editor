import { Card, EmptyState } from "@clipiro/ui";

const Icon = ({ d }: { d: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

// For an empty list or first-run surface: gradient icon tile, title, optional
// subtitle and one primary action (href or onClick). Usually sits inside a Card.
export const WithAction = () => (
  <Card padding="lg" className="max-w-md">
    <EmptyState
      icon={<Icon d="M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />}
      title="No projects yet"
      subtitle="Upload a long video and AutoClip will find the best moments."
      action={{ label: "Upload a video", href: "#" }}
    />
  </Card>
);

export const NoAction = () => (
  <Card padding="lg" className="max-w-md">
    <EmptyState
      icon={<Icon d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />}
      title="No clips match “podcast”"
      subtitle="Try a different search, or clear the filters."
    />
  </Card>
);
