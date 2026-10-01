import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors, radius, statusTint, type } from "@/theme";
import { Icon } from "./Icon";

/** "──── OR ────" between the main action and Google (E-Login, E-Signup). */
export function OrDivider() {
  return (
    <View style={styles.or} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.rule} />
      <Text style={type(11, "medium", { color: colors.fgSubtle, tracking: 0.1 })}>OR</Text>
      <View style={styles.rule} />
    </View>
  );
}

/** Secondary pill with Google's four-colour G — the brand mark, so its own colours. */
export function GoogleButton({ onPress, label = "Continue with Google" }: { onPress: () => void; label?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.google, pressed && { backgroundColor: colors.surface3 }]}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z" />
        <Path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.8-3.8h-4v3.1A12 12 0 0 0 12 24z" />
        <Path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
        <Path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8z" />
      </Svg>
      <Text style={type(15, "semibold")}>{label}</Text>
    </Pressable>
  );
}

/** Inline problem with an optional retry (network errors on forms). */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <Icon name="alert" size={18} color={colors.error} />
      <Text style={[type(13, "regular", { color: colors.fg, lineHeight: 1.45 }), styles.bannerText]}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Try again" style={styles.retry}>
          <Text style={type(13, "semibold", { color: colors.emeraldBright })}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  or: { flexDirection: "row", alignItems: "center", gap: 12 },
  rule: { flex: 1, height: 1, backgroundColor: colors.line },
  google: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 54,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface2,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.field,
    backgroundColor: statusTint(colors.error),
    borderWidth: 1,
    borderColor: statusTint(colors.error),
  },
  bannerText: { flex: 1 },
  retry: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
});
