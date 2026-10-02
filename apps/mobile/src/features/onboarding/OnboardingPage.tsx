import { router, type Href } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandMark, Button, PhotoMosaic } from "@/components";
import { colors, derived, radius, type } from "@/theme";

// Shared frame of the four onboarding pages (design/screens/E-Welcome…E-Grow):
// 500pt photo wall with the page's hero on it, logo + Skip on top, then the
// step dots, headline, body and the lime CTA pinned to the bottom.
export const HERO_HEIGHT = 500;

export function OnboardingPage({
  step,
  title,
  body,
  cta,
  next,
  hero,
  photoOpacity = 0.75,
}: {
  step: number; // 0-based, of 4
  title: string;
  body: string;
  cta: string;
  next: Href;
  hero: ReactNode;
  /** How strongly the photo wall shows through (the design dims it behind busier heroes). */
  photoOpacity?: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ minHeight: "100%", paddingBottom: insets.bottom + 32 }} bounces={false}>
        <View style={{ height: HERO_HEIGHT + insets.top }}>
          <PhotoMosaic height={HERO_HEIGHT + insets.top} tile={210} opacity={photoOpacity} />
          <View style={[styles.top, { top: insets.top + 24 }]}>
            <BrandMark />
            <Pressable
              onPress={() => router.replace("/login")}
              accessibilityRole="button"
              accessibilityLabel="Skip"
              accessibilityHint="Goes to log in"
              style={styles.skip}
            >
              <Text style={type(13, "medium")}>Skip</Text>
            </Pressable>
          </View>
          <View style={[StyleSheet.absoluteFill, { top: insets.top, pointerEvents: "box-none" }]}>
            {hero}
          </View>
        </View>

        <View style={styles.copy}>
          <View style={styles.dots} accessible accessibilityLabel={`Step ${step + 1} of 4`}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotOn]} />
            ))}
          </View>
          <Text style={type(28, "bold", { tracking: -0.03, lineHeight: 1.12 })} textBreakStrategy="balanced" accessibilityRole="header">
            {title}
          </Text>
          <Text style={type(15, "regular", { color: colors.fgMuted, lineHeight: 1.55 })}>{body}</Text>
          <View style={{ flexGrow: 1, minHeight: 24 }} />
          <Button label={cta} icon="arrowRight" fullWidth onPress={() => router.push(next)} />
        </View>
      </ScrollView>
    </View>
  );
}

/** The raised dark card used by the heroes (shadow from the designs). */
export const heroCard = {
  backgroundColor: colors.surface2,
  borderWidth: 1,
  borderColor: colors.lineStrong,
  boxShadow: `0 0 0 1px ${derived.hairline}, 0 8px 24px ${derived.shadow}`,
} as const;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { position: "absolute", left: 24, right: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 2 },
  skip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    justifyContent: "center",
    backgroundColor: derived.glass,
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  copy: { flexGrow: 1, paddingTop: 20, paddingHorizontal: 24, gap: 12 },
  dots: { flexDirection: "row", gap: 6, alignItems: "center" },
  dot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.lineStrong },
  dotOn: { width: 24, backgroundColor: colors.emeraldBright },
});
