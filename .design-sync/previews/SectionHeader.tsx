import { SectionHeader } from "@clipiro/ui";

// Heading for a dashboard section, with an optional "see all" link on the right.
export const WithAction = () => (
  <div className="max-w-2xl">
    <SectionHeader title="Recent projects" action={{ label: "View all", href: "#" }} />
  </div>
);

export const TitleOnly = () => (
  <div className="max-w-2xl">
    <SectionHeader title="Your tools" />
  </div>
);
