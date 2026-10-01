import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, derived, radius, statusTint, type } from "@/theme";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "lg" | "md" | "sm";

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  /** primary = the ONE lime action on a screen. */
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconPosition?: "start" | "end";
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

// lg = 54 (screen CTA), md = 44 (secondary pill), sm = 40 (header Export).
const SIZES = {
  lg: { height: 54, px: 24, font: type(16, "semibold", { tracking: -0.01 }), icon: 18 },
  md: { height: 44, px: 14, font: type(13, "medium"), icon: 15 },
  sm: { height: 40, px: 16, font: type(14, "semibold"), icon: 15 },
} as const;

const VARIANTS = {
  primary: { bg: colors.primary, pressed: colors.primaryPress, fg: colors.onPrimary, border: "transparent" },
  secondary: { bg: colors.surface2, pressed: colors.surface3, fg: colors.fg, border: colors.lineStrong },
  ghost: { bg: "transparent", pressed: derived.hairline, fg: colors.emeraldBright, border: "transparent" },
  danger: { bg: statusTint(colors.error), pressed: colors.surface3, fg: colors.error, border: "transparent" },
} as const;

export function Button({
  label,
  onPress,
  variant = "primary",
  size = variant === "primary" ? "lg" : "md",
  icon,
  iconPosition = "end",
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const s = SIZES[size];
  const v = VARIANTS[variant];
  const inactive = disabled || loading;
  const iconEl = icon ? <Icon name={icon} size={s.icon} color={v.fg} strokeWidth={variant === "primary" ? 2.2 : 1.8} /> : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      aria-disabled={inactive}
      aria-busy={loading}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: s.height,
          paddingHorizontal: s.px,
          backgroundColor: pressed && !inactive ? v.pressed : v.bg,
          borderColor: v.border,
        },
        fullWidth && styles.full,
        disabled && !loading && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} testID={testID ? `${testID}-spinner` : "button-spinner"} />
      ) : (
        <View style={styles.row}>
          {iconPosition === "start" && iconEl}
          <Text style={[s.font, { color: v.fg }]} numberOfLines={1}>
            {label}
          </Text>
          {iconPosition === "end" && iconEl}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  full: { alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  disabled: { opacity: 0.4 },
});
