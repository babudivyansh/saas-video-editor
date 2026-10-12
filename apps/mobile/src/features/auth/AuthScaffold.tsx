import { router, type Href } from "expo-router";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton, PhotoMosaic } from "@/components";
import { colors, derived, radius, type } from "@/theme";

// Frame shared by Login, Sign up, OTP and Forgot (design/screens/E-*.html):
// 330pt photo wall (45%), back button, a raised card starting at `cardTop`,
// and a footer link pinned to the bottom. Scrolls and lifts with the keyboard.
export function AuthScaffold({
  cardTop,
  backTo,
  footer,
  children,
}: {
  /** Where the card starts in the design (Login 250, Sign up 170). */
  cardTop: number;
  /** Fallback when there is no history to go back to. */
  backTo: Href;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <PhotoMosaic height={330 + insets.top} tile={180} opacity={0.45} fade="veil" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + cardTop, paddingBottom: insets.bottom + 32 }]}
      >
        <View style={styles.card}>{children}</View>
        <View style={{ flexGrow: 1, minHeight: 32 }} />
        {footer}
      </ScrollView>
      <IconButton
        icon="back"
        accessibilityLabel="Back"
        onPress={() => (router.canGoBack() ? router.back() : router.replace(backTo))}
        style={[styles.back, { top: insets.top + 24 }]}
      />
    </KeyboardAvoidingView>
  );
}

/** "New to Clipiro? Create an account" style footer: muted text + emerald link. */
export function FooterLink({ prompt, label, onPress }: { prompt?: string; label: string; onPress: () => void }) {
  return (
    <View style={styles.footer}>
      {prompt ? <Text style={type(14, "regular", { color: colors.fgMuted })}>{prompt} </Text> : null}
      <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={label} style={styles.footerLink}>
        <Text style={type(14, "semibold", { color: colors.emeraldBright })}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 16 },
  card: {
    borderRadius: radius.card,
    paddingVertical: 24,
    paddingHorizontal: 20,
    gap: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    boxShadow: `0 0 0 1px ${derived.hairline}, 0 8px 24px ${derived.shadow}`,
  },
  back: { position: "absolute", left: 24, backgroundColor: derived.glass },
  footer: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center" },
  footerLink: { minHeight: 44, justifyContent: "center" },
});
