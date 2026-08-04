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

export { TypeBars, type TypeBarsItem } from "./TypeBars";
export { ChartFrame, type ChartFrameProps, type ChartSeriesMeta } from "./ChartFrame";
export { TimeSeriesChart, type TimeSeriesChartProps } from "./TimeSeriesChart";
export { StackedBarChart, type StackedBarChartProps } from "./StackedBarChart";
export { ComparisonBars, type ComparisonBarsProps } from "./ComparisonBars";
export { DonutChart, type DonutChartProps } from "./DonutChart";
export { FunnelChart, type FunnelChartProps, type FunnelStage } from "./FunnelChart";
export { Gauge, type GaugeProps } from "./Gauge";
export { Sparkline, type SparklineProps } from "./Sparkline";
export { BrushRange, type BrushRangeProps } from "./BrushRange";
export { Heatmap, WEEKDAY_LABELS, BLOCK_LABELS, type HeatmapProps, type HeatmapCell } from "./Heatmap";
export { ChartExportMenu, type ChartExportMenuProps } from "./ChartExportMenu";
export { useChartCursor } from "./useChartCursor";
export {
  seriesToCsv,
  seriesToText,
  svgToPngBlob,
  flattenSvgStyles,
  downloadBlob,
  downloadCsv,
  exportFilename,
  type ExportSeries,
} from "./export";
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
