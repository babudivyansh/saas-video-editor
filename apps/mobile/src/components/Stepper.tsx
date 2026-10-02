import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, type } from "@/theme";
import { Icon } from "./Icon";

// − value + (design/screens/BN-Create.html "Clips"): 36×44 square buttons on
// surface1. Also stands in for sliders (smoothness, silence threshold) —
// steps are easier to hit than a thumb, and TalkBack reads them as an adjustable.
export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  format = String,
  size = "lg",
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Spoken name, e.g. "Clips". */
  label: string;
  format?: (v: number) => string;
  size?: "lg" | "md";
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: format(value) }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => set(value + (e.nativeEvent.actionName === "increment" ? step : -step))}
    >
      <StepButton icon="minus" label={`Less ${label.toLowerCase()}`} disabled={value <= min} onPress={() => set(value - step)} />
      <Text style={[type(size === "lg" ? 24 : 16, "bold"), styles.value]} numberOfLines={1} adjustsFontSizeToFit>
        {format(value)}
      </Text>
      <StepButton icon="plus" label={`More ${label.toLowerCase()}`} disabled={value >= max} onPress={() => set(value + step)} />
    </View>
  );
}

function StepButton({ icon, label, disabled, onPress }: { icon: "minus" | "plus"; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      importantForAccessibility="no"
      style={({ pressed }) => [styles.btn, disabled && { opacity: 0.35 }, pressed && { backgroundColor: colors.surface3 }]}
    >
      <Icon name={icon} size={18} color={colors.fg} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  value: { flex: 1, textAlign: "center" },
  btn: {
    width: 36,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
});
