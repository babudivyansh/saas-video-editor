import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radius, type } from "@/theme";
import { Icon } from "./Icon";

// "⏱ 1,000 min" pill in screen headers: 44 high, tint + tintBorder, emerald
// 13/600 (design/screens/BN-CreateHub.html). `kind` picks minutes or credits.
export function CreditsPill({
  amount,
  kind = "minutes",
  onPress,
}: {
  amount: number;
  kind?: "minutes" | "credits";
  onPress?: () => void;
}) {
  const formatted = amount.toLocaleString("en-US");
  const label = kind === "minutes" ? `${formatted} min` : `${formatted} cr`;
  const spoken = kind === "minutes" ? `${formatted} clip minutes left` : `${formatted} AI credits left`;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={spoken}
      accessibilityHint={onPress ? "Opens Credits" : undefined}
      style={({ pressed }) => [styles.pill, pressed && { opacity: 0.8 }]}
    >
      <Icon name={kind === "minutes" ? "clock" : "bolt"} size={15} color={colors.emeraldBright} strokeWidth={2} />
      <Text style={type(13, "semibold", { color: colors.emeraldBright })} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.tintBorder,
    alignSelf: "flex-start",
  },
});
