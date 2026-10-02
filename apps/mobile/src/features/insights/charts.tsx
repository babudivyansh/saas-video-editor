import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { colors, derived, radius, type } from "@/theme";

// Small, dependency-free charts drawn with react-native-svg
// (design/screens/BN-InsOverview.html "Views over time", BN-InsPlatform.html).

/** Filled line chart; `labels` under the x-axis (first / middle / last). */
export function AreaChart({ values, height = 120, labels, label }: { values: number[]; height?: number; labels?: string[]; label: string }) {
  const [w, setW] = useState(0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [values.length > 1 ? (i / (values.length - 1)) * w : w / 2, 6 + (1 - (v - min) / span) * (height - 12)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = pts.length ? `${line} L${w},${height} L0,${height} Z` : "";
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && values.length ? (
          <Svg width={w} height={height}>
            <Defs>
              <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.emeraldBright} stopOpacity={0.35} />
                <Stop offset="1" stopColor={colors.emeraldBright} stopOpacity={0.03} />
              </LinearGradient>
            </Defs>
            <Path d={area} fill="url(#area)" />
            <Path d={line} stroke={colors.emeraldBright} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          </Svg>
        ) : null}
      </View>
      {labels ? (
        <View style={styles.axis}>
          {labels.map((l) => (
            <Text key={l} style={type(11, "regular", { mono: true, color: colors.fgSubtle })}>
              {l}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** One bar split into coloured shares (views by platform). */
export function ShareBar({ parts }: { parts: { label: string; percent: number; color: string }[] }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.share} accessible accessibilityRole="image" accessibilityLabel={parts.map((p) => `${p.label} ${p.percent}%`).join(", ")}>
        {parts.map((p) => (
          <View key={p.label} style={{ flex: p.percent, backgroundColor: p.color }} />
        ))}
      </View>
      <View style={styles.legend}>
        {parts.map((p) => (
          <View key={p.label} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: p.color }]} />
            <Text style={type(12, "regular", { color: colors.fgMuted })}>
              {p.label} {p.percent}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Labelled horizontal % bars (audience age), or plain rows (top countries). */
export function PercentBars({ rows, bars = true }: { rows: { label: string; percent: number }[]; bars?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.percent));
  return (
    <View style={{ gap: bars ? 10 : 0 }}>
      {rows.map((r, i) =>
        bars ? (
          <View key={r.label} style={styles.barRow} accessible accessibilityLabel={`${r.label}: ${r.percent}%`}>
            <Text style={[type(12, "regular", { color: colors.fgMuted }), { width: 48 }]}>{r.label}</Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${(r.percent / max) * 100}%` }]} />
            </View>
            <Text style={[type(11, "regular", { mono: true }), { width: 34, textAlign: "right" }]}>{r.percent}%</Text>
          </View>
        ) : (
          <View key={r.label} style={[styles.listRow, i > 0 && styles.divider]} accessible accessibilityLabel={`${r.label}: ${r.percent}%`}>
            <Text style={[type(13, "regular"), { flex: 1 }]}>{r.label}</Text>
            <Text style={type(12, "regular", { mono: true, color: colors.fgMuted })}>{r.percent}%</Text>
          </View>
        ),
      )}
    </View>
  );
}

export const PROVIDER_COLOR = { youtube: colors.emeraldBright, instagram: colors.info, facebook: colors.warning } as const;

const styles = StyleSheet.create({
  axis: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  share: { flexDirection: "row", height: 10, borderRadius: radius.pill, overflow: "hidden", gap: 3 },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  track: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: derived.chartTrack, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.emeraldBright },
  listRow: { flexDirection: "row", alignItems: "center", minHeight: 40 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
});
