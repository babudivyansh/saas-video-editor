import { Image, type ImageSource } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, type } from "@/theme";

// Round photo with a lineStrong hairline (24/32/40/48/64 in the designs).
// Without a photo it falls back to initials on surface3.
export function Avatar({
  source,
  name,
  size = 40,
  decorative = false,
}: {
  source?: ImageSource | string | number | null;
  /** Used for initials and the accessibility label. */
  name: string;
  size?: number;
  /** True when a neighbouring text already names the person. */
  decorative?: boolean;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <View
      style={[styles.ring, { width: size, height: size }]}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : "image"}
      accessibilityLabel={decorative ? undefined : `${name} profile photo`}
      importantForAccessibility={decorative ? "no-hide-descendants" : "yes"}
    >
      {source ? (
        <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={120} />
      ) : (
        <Text style={type(Math.round(size * 0.38), "semibold", { color: colors.fgMuted })}>{initials}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    borderRadius: radius.pill,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface3,
    alignItems: "center",
    justifyContent: "center",
  },
});
