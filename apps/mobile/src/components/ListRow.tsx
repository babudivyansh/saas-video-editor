import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, type } from "@/theme";
import { Icon } from "./Icon";

// One row of a grouped list: leading visual, title + subtitle, trailing
// element or chevron. Min 64 high; rows after the first get a top hairline.
// Wrap rows in <ListGroup> for the rounded surface2 container.
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  first = false,
  destructive = false,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  first?: boolean;
  destructive?: boolean;
  accessibilityLabel?: string;
}) {
  const content = (
    <>
      {leading}
      <View style={styles.text}>
        <Text style={type(15, "semibold", { color: destructive ? colors.error : colors.fg })} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={type(12, "regular", { color: colors.fgMuted })} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <Icon name="chevronRight" size={16} color={colors.fgSubtle} /> : null)}
    </>
  );
  const rowStyle = [styles.row, !first && styles.divider];
  if (!onPress) {
    // Group the row into one TalkBack stop only when nothing inside is
    // interactive — an accessible parent would hide a trailing Toggle/Button.
    const group = !trailing;
    return (
      <View
        style={rowStyle}
        accessible={group}
        accessibilityLabel={group ? (accessibilityLabel ?? [title, subtitle].filter(Boolean).join(", ")) : undefined}
      >
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join(", ")}
      style={({ pressed }) => [...rowStyle, pressed && { backgroundColor: colors.surface3 }]}
    >
      {content}
    </Pressable>
  );
}

export function ListGroup({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 10, paddingHorizontal: 14 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  text: { flex: 1, gap: 2, minWidth: 0 },
  group: { borderRadius: 20, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
});

