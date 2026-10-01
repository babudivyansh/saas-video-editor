import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

// Clipiro logo — the same artwork as the web app (public/icon.png for the
// mark, the wordmark cut from public/logo-emerald.png; assets/brand/ is
// generated from those, don't redraw it). "sm" = onboarding header, side by
// side; "lg" = Splash, stacked. Sizes are fixed: it's a logo, not text, so it
// doesn't follow the font scale.
const MARK = require("../../assets/brand/mark.png"); // 227 × 256
const WORDMARK = require("../../assets/brand/wordmark.png"); // 491 × 170

const SIZES = {
  sm: { mark: 28, word: 21, gap: 9 },
  lg: { mark: 64, word: 34, gap: 16 },
};

export function BrandMark({ size = "sm" }: { size?: "sm" | "lg" }) {
  const s = SIZES[size];
  return (
    <View
      style={[styles.row, size === "lg" && styles.stack, { gap: s.gap }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Clipiro"
    >
      <Image source={MARK} style={{ height: s.mark, width: (s.mark * 227) / 256 }} contentFit="contain" />
      <Image source={WORDMARK} style={{ height: s.word, width: (s.word * 491) / 170 }} contentFit="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  stack: { flexDirection: "column" },
});
