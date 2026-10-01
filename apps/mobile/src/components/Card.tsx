import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius } from "@/theme";

// Card = section container (radius 24, padding 16); Tile = smaller tappable
// block (radius 16). Both surface2 with a `line` hairline.
export function Card({
  children,
  style,
  tone = "default",
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** "accent" = emerald-tinted card (Creator level, notes). */
  tone?: "default" | "accent";
}) {
  return <View style={[styles.card, tone === "accent" && styles.accent, style]}>{children}</View>;
}

export function Tile({
  children,
  onPress,
  accessibilityLabel,
  selected = false,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const body = [styles.tile, selected && styles.selected, style];
  if (!onPress) return <View style={body}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      aria-selected={selected}
      style={({ pressed }) => [...body, pressed && { backgroundColor: colors.surface3 }]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, padding: 16, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, gap: 12 },
  accent: { backgroundColor: colors.tint, borderColor: colors.tintBorder },
  tile: { borderRadius: radius.tile, padding: 14, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, minHeight: 44 },
  selected: { backgroundColor: colors.tint, borderColor: colors.emeraldBright },
});
