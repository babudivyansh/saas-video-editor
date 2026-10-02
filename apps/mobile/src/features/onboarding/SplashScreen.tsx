import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { BrandMark, PhotoMosaic } from "@/components";
import { colors, derived, radius } from "@/theme";

// design/screens/Main.html: full-screen photo wall (30%, darkened centre)
// with the logo card. The whole screen continues to onboarding.
export function SplashScreen() {
  return (
    <Pressable
      style={styles.root}
      onPress={() => router.replace("/onboarding/welcome")}
      accessibilityRole="button"
      accessibilityLabel="Clipiro. Continue"
    >
      <PhotoMosaic height={2000} tile={250} opacity={0.3} fade="radial" />
      <View style={styles.center}>
        <View style={styles.card}>
          <BrandMark size="lg" />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  card: {
    paddingVertical: 28,
    paddingHorizontal: 32,
    borderRadius: radius.card,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    boxShadow: `0 0 0 1px ${derived.hairline}, 0 8px 24px ${derived.shadow}`,
  },
});
