// Dashboard layout kit — the grammar shared by the admin dashboard and the
// Social Tracker: a 12-column band grid, the card everything sits in, the KPI
// tile family, loading/error states, and the validated dataviz palette.
//
// Chart RENDERERS are deliberately not here. There are two kits on purpose:
// app/components/charts (hand-rolled SVG, with an sr-only data table) on
// customer routes, and Recharts on admin, where the audience is small and on
// desktops. See app/components/charts/index.ts for the full argument. This
// package is what makes the two look like one product anyway.

export { Band, LAZY_GROUP, SPAN } from "./grid";
export { Panel, downloadRowsCsv, type CsvRows } from "./Panel";
export { CountUp, DeltaChip, Kpi, MiniKpi, PlaceholderKpi } from "./Kpi";
export { ErrorCard, HealthDot, Skeleton } from "./states";
export {
  BRAND,
  CHART_AXIS_TICK,
  CHART_EMPTY_COPY,
  CHART_GRID,
  CHART_MARGIN,
  PALETTE,
} from "./palette";
export { compact, pct, timeAgo } from "./format";
