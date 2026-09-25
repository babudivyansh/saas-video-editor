import { Breadcrumbs } from "@clipiro/ui";

// Items with an href render as links; the last item is always the current page.
export const ThreeLevels = () => (
  <Breadcrumbs
    items={[
      { label: "Dashboard", href: "#" },
      { label: "AutoClip", href: "#" },
      { label: "Podcast episode 42" },
    ]}
  />
);

export const TwoLevels = () => <Breadcrumbs items={[{ label: "Tools", href: "#" }, { label: "Background remover" }]} />;
