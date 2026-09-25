import { StatTile } from "@clipiro/ui";

// Compact metric: uppercase label over a gradient-text value. Lay them out in
// a grid for a stats strip. `accent` tints the tile background.
export const StatsStrip = () => (
  <div className="grid grid-cols-4 gap-3 max-w-2xl">
    <StatTile label="Clips made" value={248} accent="emerald" />
    <StatTile label="Credits left" value="1,320" />
    <StatTile label="Published" value={96} accent="violet" />
    <StatTile label="Avg. score" value={74} accent="fuchsia" />
  </div>
);

export const Single = () => (
  <div className="max-w-[12rem]">
    <StatTile label="Minutes processed" value="3,412" accent="emerald" />
  </div>
);
