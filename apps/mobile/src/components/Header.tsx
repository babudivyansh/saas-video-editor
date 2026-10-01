import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { type } from "@/theme";
import { IconButton } from "./IconButton";

// Screen header: optional 44pt back button, title, right-side actions.
// "large" = tab root titles (26/700, e.g. Projects); default = pushed screens
// (20/700, e.g. Credits).
export function Header({
  title,
  onBack,
  actions,
  large = false,
}: {
  title: string;
  onBack?: () => void;
  actions?: ReactNode;
  large?: boolean;
}) {
  return (
    <View style={styles.row}>
      {onBack && <IconButton icon="back" accessibilityLabel="Back" onPress={onBack} />}
      <Text
        style={[type(large ? 26 : 20, "bold", { tracking: -0.03, lineHeight: 1.15 }), styles.title]}
        accessibilityRole="header"
        numberOfLines={1}
      >
        {title}
      </Text>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 },
  title: { flex: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
});
