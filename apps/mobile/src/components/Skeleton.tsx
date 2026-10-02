import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, StyleSheet, View, type DimensionValue } from "react-native";
import { derived, radius } from "@/theme";

// Pulsing placeholder block. Not in the designs; matches the surfaces it
// stands in for. Pulse stops when the user has Reduce Motion on.
export function Skeleton({
  width = "100%",
  height = 16,
  rounded = 8,
}: {
  width?: DimensionValue;
  height?: number;
  rounded?: number;
}) {
  const [opacity] = useState(() => new Animated.Value(0.5));

  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || cancelled) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [opacity]);

  return <Animated.View style={{ width, height, borderRadius: rounded, backgroundColor: derived.skeleton, opacity }} />;
}

/** Card-shaped skeleton used while a list section loads. */
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <View style={styles.card} accessible accessibilityLabel="Loading" accessibilityRole="progressbar">
      <Skeleton width="40%" height={11} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "70%" : "100%"} height={14} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, padding: 16, gap: 10, backgroundColor: "transparent", borderWidth: 1, borderColor: derived.skeleton },
});
