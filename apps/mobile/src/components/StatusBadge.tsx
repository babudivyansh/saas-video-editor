import { StyleSheet, Text, View } from "react-native";
import { colors, radius, statusTint, type } from "@/theme";

export type StatusTone = "success" | "warning" | "error" | "info" | "neutral";

const TONE: Record<StatusTone, string> = {
  success: colors.success,
  warning: colors.warning,
  error: colors.error,
  info: colors.info,
  neutral: colors.fgMuted,
};

// 24-high pill, 12% tint of the status colour, 6px dot + 11/600 label
// ("Healthy", "Reconnect", "Rendering", "Failed").
export function StatusBadge({ label, tone, dot = true }: { label: string; tone: StatusTone; dot?: boolean }) {
  const c = TONE[tone];
  return (
    <View style={[styles.badge, { backgroundColor: statusTint(c) }]} accessible accessibilityLabel={`Status: ${label}`}>
      {dot && <View style={[styles.dot, { backgroundColor: c }]} />}
      <Text style={type(11, "semibold", { color: c })} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // No alignSelf: the parent decides (centred in list rows, start in columns).
  badge: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 24, paddingHorizontal: 9, borderRadius: radius.pill },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
