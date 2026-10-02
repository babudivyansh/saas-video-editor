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
  bell: <><Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><Path d="M10 21a2 2 0 0 0 4 0" /></>,
  /** Magic wand with sparkles: Background Remover, "Open editor". */
  magic: <><Path d="M5 3v4" /><Path d="M3 5h4" /><Path d="M18 14v4" /><Path d="M16 16h4" /><Path d="M14 4l6 6-10 10-6-6z" /></>,
  mic: <><Rect x="9" y="3" width="6" height="11" rx="3" /><Path d="M5 11a7 7 0 0 0 14 0" /><Path d="M12 18v3" /></>,
  image: <><Rect x="3" y="4" width="18" height="16" rx="2" /><Circle cx="9" cy="10" r="2" /><Path d="M21 16l-5-5-9 9" /></>,
  volume: <><Path d="M4 9v6h4l5 4V5L8 9z" /><Path d="M17 9a4 4 0 0 1 0 6" /></>,
  music: <><Path d="M9 18V5l12-2v13" /><Circle cx="6" cy="18" r="3" /><Circle cx="18" cy="16" r="3" /></>,
  gift: <><Rect x="3" y="8" width="18" height="4" rx="1" /><Path d="M12 8v13" /><Path d="M19 12v9H5v-9" /><Path d="M7.5 8a2.5 2.5 0 1 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 1 1 0 5" /></>,
  scissors: <><Circle cx="6" cy="6" r="3" /><Circle cx="6" cy="18" r="3" /><Path d="M20 4L8.12 15.88" /><Path d="M14.47 14.48L20 20" /><Path d="M8.12 8.12L12 12" /></>,
  download: <><Path d="M12 4v12" /><Path d="M6 10l6 6 6-6" /><Path d="M4 20h16" /></>,
  waveform: <><Path d="M2 12h2" /><Path d="M6 8v8" /><Path d="M10 5v14" /><Path d="M14 8v8" /><Path d="M18 10v4" /><Path d="M22 12h0" /></>,
  bulb: <><Path d="M9 18h6" /><Path d="M10 21h4" /><Path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" /></>,
  upload: <><Path d="M12 16V4" /><Path d="M6 10l6-6 6 6" /><Path d="M4 20h16" /></>,
  cloudUpload: <><Path d="M7 18a5 5 0 0 1-.5-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z" /><Path d="M12 12v6" /><Path d="M9.5 14.5L12 12l2.5 2.5" /></>,
  link: <><Path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><Path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></>,
  /** Timeline editor. */
  editor: <><Rect x="3" y="4" width="18" height="16" rx="2" /><Path d="M3 14h18" /><Path d="M8 14v6" /><Path d="M14 14v6" /></>,
  sliders: <><Path d="M4 6h10" /><Path d="M18 6h2" /><Circle cx="16" cy="6" r="2" /><Path d="M4 12h4" /><Path d="M12 12h8" /><Circle cx="10" cy="12" r="2" /><Path d="M4 18h12" /><Path d="M20 18h0" /><Circle cx="18" cy="18" r="2" /></>,
  /** Presets (a split card). */
  presets: <><Rect x="3" y="3" width="18" height="18" rx="2" /><Path d="M3 12h18" /></>,
  star: <Path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  file: <><Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><Path d="M14 3v5h5" /></>,
  minus: <Path d="M5 12h14" />,
  play: <Path d="M7 5l12 7-12 7z" />,
  pause: <><Rect x="6" y="5" width="4" height="14" rx="1" /><Rect x="14" y="5" width="4" height="14" rx="1" /></>,
  undo: <><Path d="M9 14L4 9l5-5" /><Path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>,
  redo: <><Path d="M15 14l5-5-5-5" /><Path d="M20 9H9a5 5 0 0 0 0 10h3" /></>,
  /** Split at playhead; also Transitions. */
  split: <><Path d="M12 3v18" /><Path d="M8 7L4 12l4 5" /><Path d="M16 7l4 5-4 5" /></>,
  trash: <><Path d="M4 7h16" /><Path d="M10 11v6" /><Path d="M14 11v6" /><Path d="M5 7l1 13h12l1-13" /><Path d="M9 7V4h6v3" /></>,
  text: <><Path d="M4 7V5h16v2" /><Path d="M12 5v14" /><Path d="M9 19h6" /></>,
  filter: <Path d="M3 5h18l-7 8v6l-4 2v-8z" />,
  globe: <><Circle cx="12" cy="12" r="9" /><Path d="M3 12h18" /><Path d="M12 3a14 14 0 0 1 0 18" /><Path d="M12 3a14 14 0 0 0 0 18" /></>,
  send: <><Path d="M22 2L11 13" /><Path d="M22 2l-7 20-4-9-9-4z" /></>,
  refresh: <><Path d="M20 11a8 8 0 0 0-14.9-3.9L4 8" /><Path d="M4 4v4h4" /><Path d="M4 13a8 8 0 0 0 14.9 3.9L20 16" /><Path d="M20 20v-4h-4" /></>,
} as const;

export type IconName = keyof typeof GLYPHS;

export function Icon({
  name,
  size = 20,
  color = colors.fg,
  strokeWidth = 1.8,
  filled = false,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Fill the shape too (a selected ★). */
  filled?: boolean;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : "none"}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLYPHS[name]}
    </Svg>
  );
}
