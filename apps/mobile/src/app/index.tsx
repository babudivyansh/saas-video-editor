import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components";
import { colors, layout, type } from "@/theme";

// Placeholder until Phase 3 builds the real navigation shell (splash →
// onboarding → auth → tabs). Only the dev component gallery is reachable.
export default function Index() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <Text style={type(26, "bold", { tracking: -0.03 })} accessibilityRole="header">
          clipiro
        </Text>
        <Text style={type(15, "regular", { color: colors.fgMuted, lineHeight: 1.5 })}>
          App skeleton (Phase 2). Screens arrive in Phase 3–4.
        </Text>
        {__DEV__ && (
          <Button label="Component gallery" variant="secondary" icon="arrowRight" onPress={() => router.push("/dev/components")} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, justifyContent: "center", padding: layout.screenPadding * 1.5, gap: 16 },
});
