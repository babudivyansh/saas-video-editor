import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, text, type } from "@/theme";

// 11px uppercase label with an optional emerald link on the right
// ("TOOLS · All →", "VOICEOVERS · My voices").
export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onPress: () => void; accessibilityLabel?: string };
}) {
  return (
    <View style={styles.row}>
      <Text style={text.label} accessibilityRole="header">
        {title}
      </Text>
      {action && (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="link"
          accessibilityLabel={action.accessibilityLabel ?? action.label}
          style={styles.action}
        >
          <Text style={type(12, "medium", { color: colors.emeraldBright })}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
  action: { minHeight: 44, justifyContent: "center", paddingLeft: 12 },
});
