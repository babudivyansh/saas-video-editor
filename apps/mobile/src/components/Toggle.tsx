import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";
import { colors, derived, radius } from "@/theme";
import { hitSlopFor } from "./touch";

export type ToggleProps = {
  value: boolean;
  onValueChange: (next: boolean) => void;
  /** Required: a toggle without a visible text label must still be named. */
  accessibilityLabel: string;
  disabled?: boolean;
  testID?: string;
};

// 48×28 track, 22px knob inset 3px. On = emerald track + dark knob;
// off = surface3 track with controlBorder outline + muted knob
// (design/screens/BN-Settings.html).
const TRAVEL = 48 - 22 - 6;

export function Toggle({ value, onValueChange, accessibilityLabel, disabled, testID }: ToggleProps) {
  const [x] = useState(() => new Animated.Value(value ? TRAVEL : 0));

  useEffect(() => {
    Animated.timing(x, { toValue: value ? TRAVEL : 0, duration: 160, useNativeDriver: true }).start();
  }, [value, x]);

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      aria-checked={value}
      aria-disabled={!!disabled}
      hitSlop={hitSlopFor(48, 28)}
      testID={testID}
      style={[styles.track, value ? styles.on : styles.off, disabled && { opacity: 0.4 }]}
    >
      <Animated.View
        style={[styles.knob, { backgroundColor: value ? colors.bg : colors.fgMuted, transform: [{ translateX: x }] }]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: 48, height: 28, borderRadius: radius.pill, justifyContent: "center", paddingHorizontal: 3 },
  on: { backgroundColor: colors.emeraldBright },
  off: { backgroundColor: colors.surface3, borderWidth: 1, borderColor: derived.controlBorder, paddingHorizontal: 2 },
  knob: { width: 22, height: 22, borderRadius: radius.pill },
});
