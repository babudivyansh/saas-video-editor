import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Chip } from "@/components";
import { colors, radius, statusTint, text, type } from "@/theme";

// Small pieces the editor panels share.

/** Three outlined boxes (Assets / Upload / Stock, Effects / Filters / Transitions). */
export function BoxTabs<T extends string>({ tabs, value, onChange, label }: { tabs: readonly { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <View style={styles.boxes} accessibilityRole="tablist" accessibilityLabel={label}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <Pressable key={t.id} onPress={() => onChange(t.id)} accessibilityRole="tab" aria-selected={on} style={[styles.box, on && styles.boxOn]}>
            <Text style={type(14, on ? "semibold" : "medium", { color: on ? colors.emeraldBright : colors.fgMuted })} numberOfLines={1} adjustsFontSizeToFit>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Wrapping chips for a single choice (fonts, animations, highlight modes). */
export function ChipChoice<T extends string>({ options, value, onChange, label }: { options: readonly { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => (
        <Chip key={o.id} label={o.label} selected={o.id === value} onPress={() => onChange(o.id)} />
      ))}
    </View>
  );
}

export function Field({ label, right, children }: { label: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.fieldHead}>
        <Text style={text.label}>{label}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Badge({ label, tone = "warning" }: { label: string; tone?: "warning" | "muted" }) {
  const c = tone === "warning" ? colors.warning : colors.fgMuted;
  return (
    <View style={[styles.badge, { backgroundColor: tone === "warning" ? statusTint(c) : colors.surface3 }]}>
      <Text style={type(10, "bold", { color: c, tracking: 0.04 })}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  boxes: { flexDirection: "row", gap: 8 },
  box: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  boxOn: { backgroundColor: colors.tint, borderColor: colors.emeraldBright },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fieldHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badge: { paddingHorizontal: 6, minHeight: 18, borderRadius: radius.pill, justifyContent: "center" },
});
