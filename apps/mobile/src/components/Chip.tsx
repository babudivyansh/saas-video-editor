import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radius, type } from "@/theme";
import { hitSlopFor } from "./touch";

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Leading count, e.g. "Scheduled 3". */
  count?: number;
  testID?: string;
};

// Filter pill: 36 high (hitSlop to 44), selected = solid fg with bg text
// (design/screens/BN-Projects.html, BN-Assets.html).
export function Chip({ label, selected = false, onPress, count, testID }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      aria-selected={selected}
      accessibilityLabel={count != null ? `${label}, ${count}` : label}
      hitSlop={hitSlopFor(80, 36)}
      testID={testID}
      style={[styles.chip, selected ? styles.on : styles.off]}
    >
      <Text style={type(13, selected ? "semibold" : "medium", { color: selected ? colors.bg : colors.fgMuted })} numberOfLines={1}>
        {label}
        {count != null ? ` ${count}` : ""}
      </Text>
    </Pressable>
  );
}

export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={accessibilityLabel}
      contentContainerStyle={styles.row}
    >
      {options.map((o) => (
        <Chip key={o.value} label={o.label} count={o.count} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
      <View style={{ width: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, justifyContent: "center" },
  on: { backgroundColor: colors.fg, borderColor: colors.fg },
  off: { backgroundColor: "transparent", borderColor: colors.lineStrong },
  row: { gap: 8, paddingVertical: 4 },
});
