import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors, type } from "@/theme";
import { Icon, type IconName } from "./Icon";

// 48-unit viewBox, r=20, stroke 4, round cap, starting at 12 o'clock
// (design/screens/BN-Social.html health ring, BN-Credits.html balance rings).
// Shows the number, or an icon (the "icon variant").
const R = 20;
const C = 2 * Math.PI * R;

export function ScoreRing({
  value,
  max = 100,
  size = 52,
  color = colors.emeraldBright,
  icon,
  label,
}: {
  value: number;
  max?: number;
  size?: number;
  color?: string;
  /** Show this icon in the centre instead of the number. */
  icon?: IconName;
  /** Spoken description, e.g. "Account health". */
  label: string;
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: Math.round(value) }}
    >
      <Svg width={size} height={size} viewBox="0 0 48 48" style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={24} cy={24} r={R} fill="none" stroke={colors.surface3} strokeWidth={4} />
        <Circle
          cx={24}
          cy={24}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${C}`}
          strokeDashoffset={C * (1 - pct)}
        />
      </Svg>
      <View style={[styles.center, { pointerEvents: "none" }]}>
        {icon ? (
          <Icon name={icon} size={Math.round(size * 0.36)} color={color} strokeWidth={2} />
        ) : (
          <Text style={type(Math.round(size * 0.33), "bold")} allowFontScaling={false}>
            {Math.round(value)}
          </Text>
        )}
      </View>
    </View>
  );
}

/** Small solid score badge laid on clip thumbnails ("92"). */
export function ScoreBadge({ score, compact = false }: { score: number; compact?: boolean }) {
  return (
    <View
      style={[styles.badge, compact && styles.badgeCompact]}
      accessible
      accessibilityLabel={`Virality score ${score}`}
    >
      <Text style={type(compact ? 11 : 12, "bold", { color: colors.bg })}>{score}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  badge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.emeraldBright },
  badgeCompact: { paddingHorizontal: 5, paddingVertical: 1 },
});
