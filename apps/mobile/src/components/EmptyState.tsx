import { StyleSheet, Text, View } from "react-native";
import { colors, radius, type } from "@/theme";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

// Not drawn in the designs — composed from the OTP/Login header pattern:
// 56px tinted icon tile, title, one line of body, optional action.
// `tone="error"` is the error-with-retry state every data screen needs.
export function EmptyState({
  icon = "folder",
  title,
  body,
  action,
  tone = "empty",
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
  tone?: "empty" | "error";
}) {
  const accent = tone === "error" ? colors.error : colors.emeraldBright;
  return (
    <View style={styles.wrap} accessibilityLiveRegion={tone === "error" ? "polite" : "none"}>
      <View style={[styles.iconTile, tone === "error" && styles.errorTile]}>
        <Icon name={tone === "error" ? "alert" : icon} size={26} color={accent} />
      </View>
      <Text style={[type(17, "bold"), styles.center]} accessibilityRole="header">
        {title}
      </Text>
      {body ? <Text style={[type(14, "regular", { color: colors.fgMuted, lineHeight: 1.5 }), styles.center]}>{body}</Text> : null}
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          variant="secondary"
          icon={tone === "error" ? "refresh" : undefined}
          iconPosition="start"
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: 32, paddingHorizontal: 24, gap: 8 },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: radius.tile,
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.tintBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  errorTile: { backgroundColor: colors.surface3, borderColor: colors.lineStrong },
  center: { textAlign: "center" },
  action: { alignSelf: "center", marginTop: 8 },
});
