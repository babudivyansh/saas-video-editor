import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, type } from "@/theme";
import { Icon } from "./Icon";

// Single-choice list for sheets (clip length, ratio, voice). Not drawn in the
// designs; rows use the Tile look with an emerald check on the chosen one.
export function OptionList<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly { value: T; label: string; detail?: string; leading?: ReactNode; trailing?: string; disabled?: boolean }[];
  value: T | null;
  onChange: (v: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            disabled={o.disabled}
            accessibilityRole="radio"
            aria-checked={on}
            aria-disabled={!!o.disabled}
            accessibilityLabel={[o.label, o.detail, o.trailing].filter(Boolean).join(", ")}
            style={({ pressed }) => [styles.row, on && styles.on, o.disabled && { opacity: 0.5 }, pressed && { backgroundColor: colors.surface3 }]}
          >
            {o.leading}
            <View style={{ flex: 1 }}>
              <Text style={type(15, "semibold")}>{o.label}</Text>
              {o.detail ? <Text style={type(12, "regular", { color: colors.fgMuted })}>{o.detail}</Text> : null}
            </View>
            {o.trailing ? <Text style={type(12, "semibold", { color: colors.warning })}>{o.trailing}</Text> : null}
            <View style={[styles.radio, on && styles.radioOn]}>{on ? <Icon name="check" size={14} color={colors.bg} strokeWidth={2.6} /> : null}</View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.tile,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.line,
  },
  on: { borderColor: colors.emeraldBright, backgroundColor: colors.tint },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center" },
  radioOn: { backgroundColor: colors.emeraldBright, borderColor: colors.emeraldBright },
});
