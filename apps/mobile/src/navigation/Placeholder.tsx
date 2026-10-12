import { router, type Href } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Card, CreditsPill, Header } from "@/components";
import { colors, layout, text, type } from "@/theme";
import { useSession } from "@/state/session";
import { SCREENS, TAB_ROOTS, type Link, type ScreenId } from "./screens";

// Phase 3 stand-in for every screen: real header + back behaviour, the
// design file it will become, and one button per link the design draws.
// Phase 4 replaces these one section at a time.

export function go(link: Link) {
  if (link.session) {
    useSession.getState()[link.session]();
    return;
  }
  const href = SCREENS[link.to].href as Href;
  if (link.replace) router.replace(href);
  else router.push(href);
}

export function goBack(id: ScreenId) {
  if (router.canGoBack()) router.back();
  else {
    const back = SCREENS[id].back;
    if (back) router.replace(SCREENS[back].href as Href);
  }
}

export function Placeholder({ id, detail }: { id: ScreenId; detail?: string }) {
  const s = SCREENS[id];
  const insets = useSafeAreaInsets();
  const isTabRoot = TAB_ROOTS.includes(id);
  const inTabs = s.file.startsWith("(tabs)");
  const bottomPad = inTabs ? layout.tabBar.height + layout.tabBar.inset + insets.bottom + 24 : insets.bottom + 24;
  // The first link is the screen's main action and the only lime one.
  const primary = s.links[0];

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 8, paddingBottom: bottomPad },
        ]}
      >
        <Header
          title={s.title}
          large={isTabRoot}
          onBack={isTabRoot || id === "Main" ? undefined : () => goBack(id)}
          actions={id === "BN-CreateHub" || id === "BN-Create" || id === "BN-AIMedia" ? <CreditsPill amount={1000} onPress={() => go({ to: "BN-Credits", label: "Credits" })} /> : undefined}
        />
        <Card>
          <Text style={text.label}>{s.section}</Text>
          <Text style={type(15, "semibold")}>Placeholder · design/{id}.html</Text>
          <Text style={text.caption}>
            Route {s.href}
            {detail ? ` · ${detail}` : ""}
          </Text>
        </Card>

        {s.links.length > 0 && (
          <View style={styles.links}>
            <Text style={text.label} accessibilityRole="header">
              Goes to
            </Text>
            {s.links.map((l) => (
              <Button
                key={`${l.to}-${l.label}`}
                label={l.label}
                variant={l === primary && !isTabRoot ? "primary" : "secondary"}
                size={l === primary && !isTabRoot ? "lg" : "md"}
                icon="arrowRight"
                fullWidth
                accessibilityHint={`Opens ${SCREENS[l.to].title}`}
                onPress={() => go(l)}
              />
            ))}
          </View>
        )}

        {id === "Main" && __DEV__ && (
          <Button label="Component gallery" variant="ghost" onPress={() => router.push("/dev/components")} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, gap: 20 },
  links: { gap: 10 },
});
