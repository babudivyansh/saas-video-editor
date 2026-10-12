import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, type } from "@/theme";

// Social Studio / Insights tabs: 4px-padded track (surface1, line border,
// radius 14) with equal 40-high segments; the selected one is surface3
// (design/screens/BN-Accounts.html).
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <View style={styles.track} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            aria-selected={selected}
            accessibilityLabel={o.label}
            hitSlop={{ top: 2, bottom: 2 }}
            style={[styles.segment, selected && styles.selected]}
          >
            <Text style={[type(13, selected ? "semibold" : "medium", { color: selected ? colors.fg : colors.fgMuted }), { textAlign: "center" }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    gap: 6,
    padding: 4,
    borderRadius: 14,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.line,
  },
  segment: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  selected: { backgroundColor: colors.surface3 },
});
