import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, derived, type } from "@/theme";
import { Icon } from "./Icon";

// 22px box, radius 6; checked = emerald fill with dark tick
// (design/screens/E-Signup.html terms checkbox). The whole row is the target.
export function Checkbox({
  checked,
  onChange,
  label,
  accessibilityLabel,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  /** Needed when `label` is not plain text. */
  accessibilityLabel?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      aria-checked={checked}
      aria-disabled={!!disabled}
      accessibilityLabel={accessibilityLabel ?? (typeof label === "string" ? label : undefined)}
      style={[styles.row, disabled && { opacity: 0.4 }]}
    >
      <View style={[styles.box, checked ? styles.on : styles.off]}>
        {checked && <Icon name="check" size={14} color={colors.bg} strokeWidth={3} />}
      </View>
      {typeof label === "string" ? <Text style={[type(14, "regular", { color: colors.fgMuted }), styles.label]}>{label}</Text> : label}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 44, paddingVertical: 11 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  on: { backgroundColor: colors.emeraldBright, borderColor: colors.emeraldBright },
  off: { backgroundColor: colors.surface1, borderColor: derived.controlBorder },
  label: { flex: 1, lineHeight: 21 },
});
