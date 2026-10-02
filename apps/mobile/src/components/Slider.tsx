import { useState } from "react";
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import { colors, radius } from "@/theme";

// Track + thumb (design/screens/BN-EdCaptions.html "Size", BN-EdAudio.html
// volumes): 4px track on surface3, emerald fill, 22px fg thumb. Drag or tap
// anywhere on the 44pt-tall hit area; TalkBack adjusts it in `step`s.
export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  formatValue = (v) => `${v}`,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Spoken name, e.g. "Music volume". */
  label: string;
  formatValue?: (v: number) => string;
}) {
  const [width, setWidth] = useState(0);
  const fromX = (e: GestureResponderEvent) => {
    if (!width) return;
    const x = Math.min(Math.max(e.nativeEvent.locationX, 0), width);
    const raw = min + (x / width) * (max - min);
    onChange(Math.min(max, Math.max(min, Math.round(raw / step) * step)));
  };

  const pct = max > min ? (value - min) / (max - min) : 0;
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <View
      style={styles.hit}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: formatValue(value) }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => set(value + (e.nativeEvent.actionName === "increment" ? step : -step))}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={fromX}
      onResponderMove={fromX}
    >
      <View style={[styles.track, { pointerEvents: "none" }]}>
        <View style={[styles.fill, { width: `${pct * 100}%` }]} />
      </View>
      <View style={[styles.thumb, { left: pct * width - 11, pointerEvents: "none" }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 44, justifyContent: "center" },
  track: { height: 4, borderRadius: radius.pill, backgroundColor: colors.surface3, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.emeraldBright },
  thumb: { position: "absolute", top: 11, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.fg },
});
