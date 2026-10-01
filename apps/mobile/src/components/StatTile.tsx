import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, text, type } from "@/theme";

// Label + big number (+ optional delta/sub) on surface2, radius 16
// (design/screens/BN-AssetsAI.html stat row, BN-InsOverview.html KPIs).
export function StatTile({
  label,
  value,
  delta,
  deltaTone = "positive",
  sub,
  children,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "positive" | "negative" | "neutral";
  sub?: string;
  /** Extra content under the value (sparkline, ring…). */
  children?: ReactNode;
}) {
  const deltaColor = deltaTone === "positive" ? colors.emeraldBright : deltaTone === "negative" ? colors.error : colors.fgMuted;
  return (
    <View style={styles.tile} accessible accessibilityLabel={[label, value, delta, sub].filter(Boolean).join(", ")}>
      <Text style={text.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.valueRow}>
        <Text style={type(26, "bold", { tracking: -0.03 })} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {delta ? <Text style={type(13, "semibold", { color: deltaColor })}>{delta}</Text> : null}
      </View>
      {sub ? <Text style={text.caption}>{sub}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.tile,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 4,
  },
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
});
