import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, type } from "@/theme";
import { IconButton } from "./IconButton";

// Screen header: optional 44pt back button, title, right-side actions.
// "large" = tab root titles (26/700, e.g. Projects); default = pushed screens
// (20/700, e.g. Credits).
export function Header({
  title,
  subtitle,
  onBack,
  actions,
  large = false,
}: {
  title: string;
  /** Muted line under the title ("Your creative assistant"). */
  subtitle?: string;
  onBack?: () => void;
  actions?: ReactNode;
  large?: boolean;
}) {
  const heading = (
    <Text
      style={type(large ? 26 : 20, "bold", { tracking: -0.03, lineHeight: 1.15 })}
      accessibilityRole="header"
      // One line that shrinks (to 70%) at very large system font sizes rather
      // than Android breaking a word across lines; titles are short.
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
    >
      {title}
    </Text>
  );
  return (
    <View style={styles.row}>
      {onBack && <IconButton icon="back" accessibilityLabel="Back" onPress={onBack} />}
      <View style={styles.title}>
        {heading}
        {subtitle ? <Text style={type(12, "regular", { color: colors.fgMuted })}>{subtitle}</Text> : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 },
  title: { flex: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
});
