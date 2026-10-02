import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { colors, type } from "@/theme";

// Text tabs with an emerald underline (design/screens/BN-AIMedia.html):
// 44 high, 20 apart, scrolls sideways when they don't fit.
export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  accessibilityLabel,
}: {
  tabs: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={styles.bar}
      contentContainerStyle={styles.row}
    >
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <Pressable
            key={t.value}
            onPress={() => onChange(t.value)}
            accessibilityRole="tab"
            aria-selected={on}
            testID={`tab-${t.value}`}
            style={[styles.tab, on && styles.on]}
          >
            <Text style={type(14, on ? "semibold" : "medium", { color: on ? colors.fg : colors.fgMuted })} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.line },
  row: { gap: 20 },
  tab: { minHeight: 44, justifyContent: "center", paddingHorizontal: 2, borderBottomWidth: 2, borderBottomColor: "transparent" },
  on: { borderBottomColor: colors.emeraldBright },
});
