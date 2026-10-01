import { StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { colors, type } from "@/theme";

// Clipiro logo: emerald rounded tile with a phone-and-play glyph, plus the
// wordmark. "sm" = onboarding header (30px tile, 19px word); "lg" = Splash
// (60px tile, 30px word, stacked).
export function BrandMark({ size = "sm" }: { size?: "sm" | "lg" }) {
  const lg = size === "lg";
  const tile = lg ? 60 : 30;
  return (
    <View style={[styles.row, lg && styles.stack]} accessible accessibilityRole="image" accessibilityLabel="Clipiro">
      <View style={[styles.tile, { width: tile, height: tile, borderRadius: lg ? 17 : 8 }]}>
        <Svg width={lg ? 34 : 17} height={lg ? 34 : 17} viewBox="0 0 24 24" fill="none">
          <Rect x={6} y={2.5} width={12} height={19} rx={2.5} stroke={colors.bg} strokeWidth={2.2} />
          <Path d="M10.5 9l4 3-4 3z" fill={colors.bg} />
        </Svg>
      </View>
      <Text style={type(lg ? 30 : 19, "bold", { tracking: -0.03 })} allowFontScaling={false}>
        clipiro
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 9 },
  stack: { flexDirection: "column", gap: 14 },
  tile: { backgroundColor: colors.emerald, alignItems: "center", justifyContent: "center" },
});
