import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, elevation, layout, radius, type } from "@/theme";
import { Icon, type IconName } from "./Icon";

export type TabKey = "home" | "projects" | "create" | "social" | "you";

const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: "home", label: "Home", icon: "home" },
  { key: "projects", label: "Projects", icon: "projects" },
  { key: "create", label: "Create", icon: "plus" },
  { key: "social", label: "Social", icon: "social" },
  { key: "you", label: "You", icon: "you" },
];

// Floating pill bar: inset 16, 68 high, surface2 + lineStrong, heavy shadow.
// Active tab = emerald-tinted pill with icon + label; Create = 52px emerald
// circle in the centre (design/screens/BN-Home.html <nav>).
// Presentational: Phase 3 plugs it into Expo Router's tab navigator.
export function TabBar({ active, onSelect }: { active: TabKey; onSelect: (key: TabKey) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.bar, { bottom: layout.tabBar.inset + insets.bottom }]}
      accessibilityRole="tablist"
      accessibilityLabel="Main"
    >
      {TABS.map((t) => {
        const selected = t.key === active;
        if (t.key === "create") {
          return (
            <Pressable
              key={t.key}
              onPress={() => onSelect(t.key)}
              accessibilityRole="tab"
              accessibilityLabel="Create"
              aria-selected={selected}
              style={({ pressed }) => [styles.create, pressed && { backgroundColor: colors.emerald }]}
            >
              <Icon name="plus" size={24} color={colors.bg} strokeWidth={2.6} />
            </Pressable>
          );
        }
        return (
          <Pressable
            key={t.key}
            onPress={() => onSelect(t.key)}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            aria-selected={selected}
            style={[styles.item, selected && styles.itemActive]}
          >
            <Icon name={t.icon} size={selected ? 19 : 21} color={selected ? colors.emeraldBright : colors.fgMuted} strokeWidth={selected ? 2 : 1.8} />
            {selected && (
              <Text style={type(13, "semibold", { color: colors.emeraldBright })} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                {t.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: layout.tabBar.inset,
    right: layout.tabBar.inset,
    height: layout.tabBar.height,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    ...elevation.tabBar,
  },
  item: { minWidth: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  itemActive: { flexDirection: "row", gap: 6, paddingHorizontal: 14, backgroundColor: colors.tint },
  create: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: colors.emeraldBright, alignItems: "center", justifyContent: "center" },
});
