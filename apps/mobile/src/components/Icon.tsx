import Svg, { Circle, Path, Rect } from "react-native-svg";
import { colors } from "@/theme";

// Line icons as drawn in design/screens (24×24 viewBox, round caps and joins).
// Only the glyphs the shared components need; screens add theirs in later phases.
const GLYPHS = {
  back: <><Path d="M19 12H5" /><Path d="M11 18l-6-6 6-6" /></>,
  plus: <><Path d="M12 5v14" /><Path d="M5 12h14" /></>,
  check: <Path d="M5 12l5 5L20 7" />,
  close: <><Path d="M6 6l12 12" /><Path d="M18 6L6 18" /></>,
  chevronRight: <Path d="M9 6l6 6-6 6" />,
  arrowRight: <><Path d="M5 12h14" /><Path d="M13 6l6 6-6 6" /></>,
  mail: <><Rect x="3" y="5" width="18" height="14" rx="2" /><Path d="M3 7l9 6 9-6" /></>,
  lock: <><Rect x="5" y="11" width="14" height="10" rx="2" /><Path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  eye: <><Path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><Circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><Path d="M3 3l18 18" /><Path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2" /><Path d="M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /></>,
  search: <><Circle cx="11" cy="11" r="7" /><Path d="M20 20l-3.5-3.5" /></>,
  clock: <><Circle cx="12" cy="12" r="9" /><Path d="M12 7v5l3 2" /></>,
  bolt: <Path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  home: <><Path d="M3 11l9-7 9 7" /><Path d="M5 10v10h14V10" /><Path d="M10 20v-6h4v6" /></>,
  projects: <><Rect x="3" y="3" width="18" height="18" rx="2" /><Path d="M7 3v18" /><Path d="M17 3v18" /><Path d="M3 8h4" /><Path d="M3 16h4" /><Path d="M17 8h4" /><Path d="M17 16h4" /></>,
  social: <><Circle cx="18" cy="5" r="3" /><Circle cx="6" cy="12" r="3" /><Circle cx="18" cy="19" r="3" /><Path d="M8.6 13.5l6.8 4" /><Path d="M15.4 6.5l-6.8 4" /></>,
  you: <><Circle cx="12" cy="12" r="9" /><Circle cx="12" cy="10" r="3" /><Path d="M6.5 18.5a6 6 0 0 1 11 0" /></>,
  sparkle: <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  folder: <Path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  alert: <><Circle cx="12" cy="12" r="9" /><Path d="M12 8v5" /><Path d="M12 16h.01" /></>,
  info: <><Circle cx="12" cy="12" r="9" /><Path d="M12 11v5" /><Path d="M12 8h.01" /></>,
  captions: <><Rect x="3" y="5" width="18" height="14" rx="2" /><Path d="M7 15h4" /><Path d="M13 15h4" /><Path d="M7 11h10" /></>,
  crop: <><Path d="M6 2v14a2 2 0 0 0 2 2h14" /><Path d="M18 22V8a2 2 0 0 0-2-2H2" /></>,
  wand: <><Path d="M12 5h2" /><Path d="M16 5h2" /><Path d="M3 21l12-12" /><Path d="M15 9l2-2" /></>,
  key: <><Circle cx="8" cy="15" r="4" /><Path d="M11 12l9-9" /><Path d="M17 6l3 3" /></>,
  person: <><Circle cx="12" cy="8" r="4" /><Path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  refresh: <><Path d="M20 11a8 8 0 0 0-14.9-3.9L4 8" /><Path d="M4 4v4h4" /><Path d="M4 13a8 8 0 0 0 14.9 3.9L20 16" /><Path d="M20 20v-4h-4" /></>,
} as const;

export type IconName = keyof typeof GLYPHS;

export function Icon({
  name,
  size = 20,
  color = colors.fg,
  strokeWidth = 1.8,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLYPHS[name]}
    </Svg>
  );
}
