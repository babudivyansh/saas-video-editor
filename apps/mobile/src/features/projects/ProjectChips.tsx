import { PROJECT_FILTERS, type ProjectFilter } from "@clipiro/shared";
import { router, type Href } from "expo-router";
import { FilterPills } from "@/components";

// The chips across the top of All / Drafts / clip views. In the design they're
// links between those screens, so they act as a switcher: All goes back to the
// list, the others replace whichever view is showing (Back still returns to All).
const HREF: Record<ProjectFilter, Href> = {
  all: "/projects",
  drafts: "/projects/drafts",
  vertical: { pathname: "/projects/videos-reels-shorts", params: { shape: "vertical" } },
  wide: { pathname: "/projects/videos-reels-shorts", params: { shape: "wide" } },
  square: { pathname: "/projects/videos-reels-shorts", params: { shape: "square" } },
};

export function ProjectChips({ value }: { value: ProjectFilter }) {
  return (
    <FilterPills
      accessibilityLabel="Show"
      options={PROJECT_FILTERS.map((f) => ({ value: f.id, label: f.label }))}
      value={value}
      onChange={(next) => {
        if (next === value) return;
        if (next === "all") return router.dismissTo("/projects");
        if (value === "all") router.push(HREF[next]);
        else router.replace(HREF[next]);
      }}
    />
  );
}
