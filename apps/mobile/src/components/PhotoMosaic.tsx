import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { colors } from "@/theme";

// Staggered three-column wall of clip thumbnails behind Splash, onboarding
// and auth (design/screens/Main.html, E-*.html). Purely decorative: hidden
// from screen readers. Photos are the design's samples (assets/images) —
// placeholders until real creator content exists.
const COLUMNS = [
  { offset: -60, photos: [require("../../assets/images/creator-violet.jpg"), require("../../assets/images/gym-lift.jpg"), require("../../assets/images/creator-smile.jpg"), require("../../assets/images/dj-neon.jpg")] },
  { offset: -140, photos: [require("../../assets/images/creator-golden.jpg"), require("../../assets/images/travel-summit.jpg"), require("../../assets/images/creator-hat.jpg"), require("../../assets/images/creator-denim.jpg")] },
  { offset: -20, photos: [require("../../assets/images/founder-portrait.jpg"), require("../../assets/images/clapper.jpg"), require("../../assets/images/podcast-mic.jpg"), require("../../assets/images/creator-golden.jpg")] },
];

export function PhotoMosaic({
  height,
  tile = 210,
  opacity = 0.75,
  fade = "bottom",
}: {
  /** Height of the mosaic area; the wall is clipped to it. */
  height: number;
  /** Tile height: 250 Splash, 210 onboarding, 180 auth. */
  tile?: number;
  opacity?: number;
  /**
   * "bottom" = clear middle, fades into the page below (onboarding);
   * "veil" = dimmed from the top, solid by `height - 20` (auth, behind the card);
   * "radial" = darkened centre (Splash).
   */
  fade?: "bottom" | "veil" | "radial";
}) {
  return (
    <View style={[styles.wrap, { height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.grid, { opacity }]}>
        {COLUMNS.map((col, c) => (
          <View key={c} style={[styles.col, { marginTop: col.offset }]}>
            {col.photos.map((src, i) => (
              <Image key={i} source={src} style={[styles.tile, { height: tile }]} contentFit="cover" cachePolicy="memory-disk" />
            ))}
          </View>
        ))}
      </View>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          {fade === "bottom" ? (
            // Design: rgba(bg,.55) 0% → 0 at 18% → 0 at 40% → solid bg at the bottom.
            <LinearGradient id="g" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.bg} stopOpacity={0.55} />
              <Stop offset="0.18" stopColor={colors.bg} stopOpacity={0} />
              <Stop offset="0.4" stopColor={colors.bg} stopOpacity={0} />
              <Stop offset="1" stopColor={colors.bg} stopOpacity={1} />
            </LinearGradient>
          ) : fade === "veil" ? (
            // Design: rgba(bg,.3) 0% → solid bg 20pt above the bottom edge.
            <LinearGradient id="g" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.bg} stopOpacity={0.3} />
              <Stop offset={(height - 20) / height} stopColor={colors.bg} stopOpacity={1} />
            </LinearGradient>
          ) : (
            <RadialGradient id="g" cx="50%" cy="48%" r="60%">
              <Stop offset="0" stopColor={colors.bg} stopOpacity={0.92} />
              <Stop offset="1" stopColor={colors.bg} stopOpacity={0.35} />
            </RadialGradient>
          )}
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#g)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, top: 0, overflow: "hidden" },
  grid: { flexDirection: "row", gap: 8, paddingHorizontal: 8 },
  col: { flex: 1, gap: 8 },
  tile: { width: "100%", borderRadius: 14 },
});
