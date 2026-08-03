// Chart package for the Social Tracker.
//
// Hand-rolled SVG rather than recharts on this surface. recharts 3 pulls a d3
// subtree (~90-110 kB gzipped) onto the heaviest customer route in a product
// whose e2e suite includes Mobile Safari, and it ships no screen-reader table
// equivalent — so adopting it would mean paying the bundle AND still writing the
// accessible layer. recharts stays on the admin pages, where the audience is
// small and on desktops.
//
// Every chart wraps in ChartFrame, which supplies the sr-only data table, and
// drives its cursor through useChartCursor, which handles pointer, touch and
// keyboard in one path.

// TRANSITIONAL. charts.tsx became charts/legacy.tsx, because a sibling file and
// directory of the same name cannot coexist — the file shadows the directory in
// module resolution. These re-exports keep the v1 surface
// (AccountAnalytics.tsx, CompetitorsSection.tsx, admin/analytics) compiling
// untouched. Stage 10 deletes both the v1 components and this block.
//
// fmtCompact/fmtPct are deliberately NOT re-exported from legacy: the versions
// in ./format are the ones everything should use, and exporting both would make
// which one you get depend on import order.
export {
  LineChart,
  BestTimeHeatmap,
  AudienceBars,
  TypeBars,
  StatTile,
  DeltaChip,
  type SeriesPoint,
  type BestTimeCell,
} from "./legacy";

export { ChartFrame, type ChartFrameProps, type ChartSeriesMeta } from "./ChartFrame";
export { TimeSeriesChart, type TimeSeriesChartProps } from "./TimeSeriesChart";
export { Heatmap, WEEKDAY_LABELS, BLOCK_LABELS, type HeatmapProps, type HeatmapCell } from "./Heatmap";
export { useChartCursor } from "./useChartCursor";
export {
  fmtCompact,
  fmtFull,
  fmtPct,
  fmtDuration,
  fmtDateShort,
  fmtDateLong,
  fmtByUnit,
  type ValueUnit,
} from "./format";
