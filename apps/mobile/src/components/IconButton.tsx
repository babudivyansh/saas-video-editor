import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { colors, layout, radius } from "@/theme";
import { Icon, type IconName } from "./Icon";
import { hitSlopFor } from "./touch";

export type IconButtonProps = {
  icon: IconName;
  /** Required: icon-only buttons are always labelled. */
  accessibilityLabel: string;
  onPress?: () => void;
  /** outline = 44pt circle with border (header back/actions); plain = bare glyph. */
  variant?: "outline" | "plain" | "accent";
  size?: number;
  iconSize?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = "outline",
  size = layout.minTouch,
  iconSize = 20,
  disabled,
  style,
  testID,
}: IconButtonProps) {
  const accent = variant === "accent";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      aria-disabled={!!disabled}
      hitSlop={hitSlopFor(size)}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size },
        variant === "outline" && styles.outline,
        accent && styles.accent,
        pressed && { opacity: 0.75 },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      <Icon name={icon} size={iconSize} color={accent ? colors.bg : colors.fg} strokeWidth={accent ? 2.4 : 1.8} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  outline: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.lineStrong },
  accent: { backgroundColor: colors.emeraldBright },
});
