import { StyleSheet, View } from "react-native";
import { colors, radius } from "@/theme";

// 4–8px rounded bar on surface3. Emerald for progress; the designs use
// warning for drafts in progress and info for rendering.
export function ProgressBar({
  value,
  max = 100,
  height = 6,
  color = colors.emeraldBright,
  label,
}: {
  value: number;
  max?: number;
  height?: number;
  color?: string;
  label: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <View
      style={[styles.track, { height }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
    >
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { borderRadius: radius.pill, backgroundColor: colors.surface3, overflow: "hidden", alignSelf: "stretch" },
  fill: { height: "100%", borderRadius: radius.pill },
});
