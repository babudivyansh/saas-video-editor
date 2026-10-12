import { EDITOR_ASPECTS } from "@clipiro/shared";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip, Icon, IconButton, useToast, type IconName } from "@/components";
import { sample } from "@/lib/images";
import { colors, radius, text, type, withAlpha } from "@/theme";
import { EditorPreview } from "./EditorPreview";
import { clock, durationOf, placed, useEditor, type Segment } from "./store";

// design/screens/BN-Editor.html — the timeline. Panels open as editor modes
// (/editor/<panel>, see PanelShell); Export is its own modal.

const TOOLS: { label: string; icon: IconName; href: Href }[] = [
  { label: "Media", icon: "projects", href: "/editor/media" },
  { label: "Text", icon: "text", href: "/editor/text" },
  { label: "Captions", icon: "captions", href: "/editor/captions" },
  { label: "Audio", icon: "music", href: "/editor/audio" },
  { label: "Effects", icon: "sparkle", href: "/editor/effects" },
  { label: "Filters", icon: "filter", href: { pathname: "/editor/effects", params: { tab: "filters" } } },
  { label: "Transitions", icon: "split", href: { pathname: "/editor/effects", params: { tab: "transitions" } } },
  { label: "AI Tools", icon: "magic", href: "/editor/ai-tools" },
];

export function EditorScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const doc = useEditor((s) => s.doc);
  const { playhead, playing, selected, past, future } = useEditor();
  const { undo, redo, split, remove, togglePlay, edit } = useEditor.getState();
  const previewW = Math.round((width - 32 - 12) * 0.64);

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.header}>
        <IconButton icon="back" accessibilityLabel="Close editor" onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))} />
        <Text style={[type(14, "semibold"), { flex: 1 }]} numberOfLines={1}>
          {doc.title}
        </Text>
        <View style={styles.aspects} accessibilityRole="radiogroup" accessibilityLabel="Aspect ratio">
          {EDITOR_ASPECTS.map((a) => (
            <Chip key={a} label={a} selected={doc.aspect === a} onPress={() => edit((d) => ({ ...d, aspect: a }))} />
          ))}
        </View>
      </View>

      <View style={styles.stage}>
        <EditorPreview width={previewW} />
        <View style={styles.side}>
          <View style={styles.timeCard} accessible accessibilityLabel={`Time ${clock(playhead)} of ${clock(durationOf(doc))}`}>
            <Text style={text.label}>Time</Text>
            <Text style={type(15, "semibold", { mono: true })}>{clock(playhead)}</Text>
            <Text style={type(11, "regular", { mono: true, color: colors.fgSubtle })}>/ {clock(durationOf(doc))}</Text>
          </View>
          <Pressable onPress={togglePlay} accessibilityRole="button" accessibilityLabel={playing ? "Pause" : "Play"} style={({ pressed }) => [styles.play, pressed && { opacity: 0.85 }]}>
            <Icon name={playing ? "pause" : "play"} size={24} color={colors.bg} filled />
          </Pressable>
          <View style={styles.pair}>
            <Control icon="undo" label="Undo" disabled={!past.length} onPress={undo} />
            <Control icon="redo" label="Redo" disabled={!future.length} onPress={redo} />
          </View>
          <View style={styles.pair}>
            <Control icon="split" label="Split at playhead" onPress={() => split() || toast("Move the playhead away from the clip's edge to split.", "info")} />
            <Control icon="trash" label="Delete selected clip" onPress={() => remove() || toast(doc.segments.length <= 1 ? "A project needs at least one clip." : "Tap a clip on the timeline first.", "info")} />
          </View>
          <Pressable
            onPress={() => router.push("/editor/export")}
            accessibilityRole="button"
            accessibilityLabel="Export"
            style={({ pressed }) => [styles.export, pressed && { backgroundColor: colors.primaryPress }]}
          >
            <Icon name="download" size={18} color={colors.onPrimary} strokeWidth={2.2} />
            <Text style={type(15, "semibold", { color: colors.onPrimary })}>Export</Text>
          </Pressable>
        </View>
      </View>

      <Timeline selected={selected} />

      <View style={styles.tools}>
        {[TOOLS.slice(0, 4), TOOLS.slice(4)].map((row, r) => (
          <View key={r} style={styles.toolRow}>
            {row.map((t) => (
              <Pressable
                key={t.label}
                onPress={() => router.push(t.href)}
                accessibilityRole="button"
                accessibilityLabel={t.label}
                // Captions reads as "on" while the project has captions (design: tinted tile).
                aria-selected={t.label === "Captions"}
                style={({ pressed }) => [styles.tool, t.label === "Captions" && styles.toolOn, pressed && { backgroundColor: colors.surface3 }]}
              >
                <Icon name={t.icon} size={20} color={t.label === "Captions" ? colors.emeraldBright : colors.fg} />
                <Text style={type(11, "regular", { color: t.label === "Captions" ? colors.emeraldBright : colors.fgMuted })} numberOfLines={1} adjustsFontSizeToFit>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Control({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={!!disabled}
      style={({ pressed }) => [styles.control, disabled && { opacity: 0.4 }, pressed && { backgroundColor: colors.surface3 }]}
    >
      <Icon name={icon} size={20} color={colors.fg} />
    </Pressable>
  );
}

const WAVE = [30, 70, 50, 90, 40, 60, 80, 35, 65, 85, 45, 55, 75, 40, 60, 30, 50, 70, 45, 65, 30, 70, 50, 90, 40, 60, 80, 35, 65, 85];

function Clip({ seg, start, total, selected }: { seg: Segment; start: number; total: number; selected: boolean }) {
  const [w, setW] = useState(1);
  const len = seg.end - seg.start;
  const { seek, select } = useEditor.getState();
  return (
    <Pressable
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onPress={(e) => {
        select(selected ? null : seg.id);
        seek(start + (e.nativeEvent.locationX / w) * len);
      }}
      accessibilityRole="button"
      aria-selected={selected}
      accessibilityLabel={`Clip ${clock(start, false)} to ${clock(start + len, false)}${selected ? ", selected" : ""}`}
      style={[styles.segment, { flex: len }, selected && styles.segmentOn]}
    >
      {Array.from({ length: Math.max(1, Math.round((len / total) * 11)) }, (_, i) => (
        <Image key={i} source={sample(seg.photo)} style={styles.thumb} contentFit="cover" />
      ))}
    </Pressable>
  );
}

/** Filmstrip with the playhead. Tap a clip to select it and move the playhead there. */
function Timeline({ selected }: { selected: string | null }) {
  const doc = useEditor((s) => s.doc);
  const playhead = useEditor((s) => s.playhead);
  const total = durationOf(doc);
  return (
    <View style={styles.strip}>
      <View style={styles.film}>
        {placed(doc).map(({ seg, start }) => (
          <Clip key={seg.id} seg={seg} start={start} total={total} selected={seg.id === selected} />
        ))}
      </View>
      <View style={styles.wave} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {WAVE.map((h, i) => (
          <View key={i} style={[styles.bar, { height: `${h}%` }]} />
        ))}
      </View>
      <View style={[styles.playhead, { left: `${(playhead / total) * 100}%`, pointerEvents: "none" }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  aspects: { flexDirection: "row", gap: 6 },
  stage: { flexDirection: "row", gap: 12 },
  side: { flex: 1, gap: 10 },
  timeCard: { padding: 12, gap: 6, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  play: { height: 64, borderRadius: 20, backgroundColor: colors.emeraldBright, alignItems: "center", justifyContent: "center" },
  pair: { flexDirection: "row", gap: 8 },
  control: { flex: 1, height: 52, borderRadius: 14, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  export: { marginTop: "auto", flexDirection: "row", gap: 6, height: 54, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  strip: { gap: 6, padding: 12, borderRadius: 18, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.line },
  film: { height: 44, flexDirection: "row", gap: 2 },
  segment: { flexDirection: "row", overflow: "hidden", borderRadius: 8, borderWidth: 2, borderColor: colors.emerald },
  segmentOn: { borderColor: colors.fg },
  thumb: { flex: 1, height: "100%" },
  wave: { height: 20, flexDirection: "row", alignItems: "center", gap: 2 },
  bar: { flex: 1, borderRadius: 1, backgroundColor: withAlpha(colors.emeraldBright, 0.5) },
  playhead: { position: "absolute", top: 6, bottom: 6, width: 2, marginLeft: 12, backgroundColor: colors.fg },
  tools: { gap: 8 },
  toolRow: { flexDirection: "row", gap: 8 },
  toolOn: { backgroundColor: colors.tint, borderColor: colors.tintBorder },
  tool: {
    flex: 1,
    height: 68,
    borderRadius: radius.tile,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 2,
  },
});
