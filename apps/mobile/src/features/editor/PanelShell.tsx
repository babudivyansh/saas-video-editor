import { router, type Href } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, IconButton, type IconName } from "@/components";
import { colors, derived, radius, type } from "@/theme";
import { EditorPreview } from "./EditorPreview";
import { clock, durationOf, useEditor } from "./store";

export type PanelId = "media" | "captions" | "audio" | "text" | "effects" | "ai-tools";

const TABS: { id: PanelId | "timeline"; label: string; icon: IconName }[] = [
  { id: "timeline", label: "Timeline", icon: "projects" },
  { id: "media", label: "Media", icon: "folder" },
  { id: "captions", label: "Captions", icon: "captions" },
  { id: "audio", label: "Audio", icon: "music" },
  { id: "text", label: "Text", icon: "text" },
  { id: "effects", label: "Effects", icon: "sparkle" },
  { id: "ai-tools", label: "AI Tools", icon: "magic" },
];

const TITLES: Record<PanelId, string> = {
  media: "Media",
  captions: "Captions",
  audio: "Audio",
  text: "Text",
  effects: "Effects",
  "ai-tools": "AI Tools",
};

/** Leave the panel: back to the timeline underneath. */
export function closePanel() {
  if (router.canGoBack()) router.back();
  else router.replace("/editor");
}

// design/screens/BN-Ed*.html — the editor in "panel mode": compact header
// with Export, smaller preview, and the panel in a raised sheet whose tab strip
// switches panels in place (router.replace, so Back always returns to the
// timeline).
export function PanelShell({ panel, children, footer }: { panel: PanelId; children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const doc = useEditor((s) => s.doc);
  const playhead = useEditor((s) => s.playhead);
  const playing = useEditor((s) => s.playing);

  // Preview gets ~43% of the screen (design: 393 of 915); the sheet fills the rest.
  const stageH = Math.round(screenH * 0.43) - insets.top - 56 + 40;
  const previewH = Math.max(120, stageH - 24);
  const width9x16 = (previewH * 9) / 16;
  const previewW = doc.aspect === "9:16" ? width9x16 : Math.min(aspectWidthFor(doc.aspect, previewH), 300);

  const go = (id: PanelId | "timeline") => {
    if (id === panel) return;
    if (id === "timeline") return closePanel();
    router.replace(`/editor/${id}` as Href);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { marginTop: insets.top }]}>
        <IconButton icon="back" accessibilityLabel="Back to timeline" onPress={closePanel} />
        <Text style={[type(14, "semibold"), { flex: 1 }]} accessibilityRole="header">
          {TITLES[panel]}
        </Text>
        <Pressable
          onPress={() => router.push("/editor/export")}
          accessibilityRole="button"
          accessibilityLabel="Export"
          style={({ pressed }) => [styles.export, pressed && { backgroundColor: colors.primaryPress }]}
        >
          <Text style={type(14, "semibold", { color: colors.onPrimary })}>Export</Text>
        </Pressable>
      </View>

      <View style={[styles.stage, { height: stageH }]}>
        <EditorPreview width={previewW} />
        <View style={[styles.overlayRow, { pointerEvents: "box-none" }]}>
          <Text style={styles.timeChip}>
            {clock(playhead, false)} / {clock(durationOf(doc), false)}
          </Text>
          <Pressable
            onPress={() => useEditor.getState().togglePlay()}
            accessibilityRole="button"
            accessibilityLabel={playing ? "Pause preview" : "Play preview"}
            style={styles.play}
          >
            <Icon name={playing ? "pause" : "play"} size={18} color={colors.bg} filled />
          </Pressable>
        </View>
      </View>

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsBar} contentContainerStyle={styles.tabs} accessibilityRole="tablist">
          {TABS.map((t) => {
            const on = t.id === panel;
            return (
              <Pressable key={t.id} onPress={() => go(t.id)} accessibilityRole="tab" aria-selected={on} accessibilityLabel={t.label} style={styles.tab}>
                <View style={[styles.tabIcon, on && { backgroundColor: colors.tint }]}>
                  <Icon name={t.icon} size={18} color={on ? colors.emeraldBright : colors.fgMuted} />
                </View>
                <Text style={type(11, "regular", { color: on ? colors.emeraldBright : colors.fgMuted })} numberOfLines={1} adjustsFontSizeToFit>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.body, { paddingBottom: (footer ? 16 : 24) + (footer ? 0 : insets.bottom) }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View> : null}
      </View>
    </View>
  );
}

function aspectWidthFor(aspect: "1:1" | "16:9", height: number) {
  return aspect === "1:1" ? height : (height * 16) / 9;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { height: 56, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  export: { minHeight: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.primary, justifyContent: "center" },
  stage: { alignItems: "center", justifyContent: "center", paddingVertical: 10 },
  overlayRow: { position: "absolute", left: 16, right: 16, bottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  timeChip: { ...type(12, "regular", { mono: true }), backgroundColor: derived.overlay, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: "hidden" },
  play: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.emeraldBright, alignItems: "center", justifyContent: "center" },
  sheet: {
    flex: 1,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    backgroundColor: colors.surface2,
    borderTopWidth: 1,
    borderColor: colors.lineStrong,
    boxShadow: `0 -12px 32px ${derived.shadow}`,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: radius.pill, backgroundColor: colors.lineStrong, marginTop: 8 },
  tabsBar: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.line },
  tabs: { paddingHorizontal: 8, paddingTop: 6, paddingBottom: 8, gap: 4 },
  tab: { width: 56, alignItems: "center", gap: 4, minHeight: 44 },
  tabIcon: { width: 44, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  body: { padding: 16, gap: 14 },
  footer: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
});
