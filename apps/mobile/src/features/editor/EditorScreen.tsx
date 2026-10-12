import { ApiError, EDITOR_ASPECTS } from "@clipiro/shared";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Chip, EmptyState, Icon, IconButton, useToast, type IconName } from "@/components";
import { apiErrorMessage } from "@/lib/errors";
import { colors, radius, text, type } from "@/theme";
import { moveVideo } from "./docOps";
import { EditorPreview } from "./EditorPreview";
import { clock, durationOf, useEditor, type SaveState } from "./store";
import { Timeline } from "./Timeline";

// design/screens/BN-Editor.html — the timeline. Opens one editor project
// (/editor?projectId=…) on the web editor's own document; changes save as you
// go. Panels open as editor modes (/editor/<panel>, see PanelShell); Export
// is its own modal.

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

const SAVE_LABEL: Record<SaveState, string> = {
  saved: "Saved",
  dirty: "Saving…",
  saving: "Saving…",
  offline: "Offline · will save",
  conflict: "Edited elsewhere",
  error: "Not saved",
};

/** Saves, then leaves the editor. */
export async function closeEditor() {
  await useEditor.getState().flush();
  if (router.canGoBack()) router.back();
  else router.replace("/projects/drafts");
}

export function EditorScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  const doc = useEditor((s) => s.doc);
  const { playhead, playing, selected, past, future, loading, loadError, title, save, saveError } = useEditor();
  const { undo, redo, split, duplicate, remove, togglePlay, edit } = useEditor.getState();
  const previewW = Math.round((width - 32 - 12) * 0.64);

  // Opening a different edit (or the first one) loads it.
  useEffect(() => {
    if (projectId && useEditor.getState().projectId !== projectId) void useEditor.getState().open(projectId);
  }, [projectId]);

  if (!projectId) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <EmptyState icon="editor" title="No edit open" body="Open a draft from Projects, or start one from a clip or a file in Assets." action={{ label: "Go to drafts", onPress: () => router.replace("/projects/drafts") }} />
      </View>
    );
  }
  if (loading || (!loadError && useEditor.getState().projectId !== projectId)) {
    return (
      <View style={[styles.root, styles.center]} accessibilityLabel="Loading the edit">
        <ActivityIndicator color={colors.emeraldBright} />
      </View>
    );
  }
  if (loadError) {
    const missing = loadError instanceof ApiError && loadError.status === 404;
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <EmptyState
          tone={missing ? "empty" : "error"}
          icon="editor"
          title={missing ? "This edit is gone" : "Couldn’t open this edit"}
          body={missing ? "It may have been deleted." : apiErrorMessage(loadError)}
          action={missing ? { label: "Back to drafts", onPress: () => router.replace("/projects/drafts") } : { label: "Try again", onPress: () => void useEditor.getState().open(projectId) }}
        />
      </View>
    );
  }

  const isVideo = selected?.track === "video";
  const total = durationOf(doc);

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.header}>
        <IconButton icon="back" accessibilityLabel="Close editor" onPress={() => void closeEditor()} />
        <View style={{ flex: 1 }}>
          <Text style={type(14, "semibold")} numberOfLines={1}>
            {title}
          </Text>
          <Text style={type(11, "regular", { color: save === "conflict" || save === "error" ? colors.error : save === "offline" ? colors.warning : colors.fgSubtle })} accessibilityLiveRegion="polite">
            {SAVE_LABEL[save]}
          </Text>
        </View>
        <View style={styles.aspects} accessibilityRole="radiogroup" accessibilityLabel="Aspect ratio">
          {EDITOR_ASPECTS.map((a) => (
            <Chip key={a} label={a} selected={doc.aspect === a} onPress={() => doc.aspect !== a && edit((d) => ({ ...d, aspect: a }))} />
          ))}
        </View>
      </View>
      {save === "conflict" || save === "error" ? (
        <View style={styles.banner} accessibilityRole="alert">
          <Text style={[type(13, "regular", { lineHeight: 1.4 }), { flex: 1 }]}>{saveError}</Text>
          {save === "conflict" ? (
            <Button label="Reload" variant="secondary" size="sm" onPress={() => void useEditor.getState().open(projectId)} />
          ) : (
            <Button label="Retry" variant="secondary" size="sm" onPress={() => (useEditor.setState({ save: "dirty" }), void useEditor.getState().flush())} />
          )}
        </View>
      ) : null}

      <View style={styles.stage}>
        <EditorPreview width={previewW} />
        <View style={styles.side}>
          <View style={styles.timeCard} accessible accessibilityLabel={`Time ${clock(playhead)} of ${clock(total)}`}>
            <Text style={text.label}>Time</Text>
            <Text style={type(15, "semibold", { mono: true })}>{clock(playhead)}</Text>
            <Text style={type(11, "regular", { mono: true, color: colors.fgSubtle })}>/ {clock(total)}</Text>
          </View>
          <Pressable onPress={togglePlay} accessibilityRole="button" accessibilityLabel={playing ? "Pause" : "Play"} style={({ pressed }) => [styles.play, pressed && { opacity: 0.85 }]}>
            <Icon name={playing ? "pause" : "play"} size={24} color={colors.bg} filled />
          </Pressable>
          <View style={styles.pair}>
            <Control icon="undo" label="Undo" disabled={!past.length} onPress={undo} />
            <Control icon="redo" label="Redo" disabled={!future.length} onPress={redo} />
          </View>
          <View style={styles.pair}>
            <Control icon="split" label="Split at playhead" onPress={() => split() || toast("Put the playhead inside a clip, away from its edges, to split.", "info")} />
            <Control icon="trash" label="Delete selected clip" onPress={() => remove() || toast("Tap a clip on the timeline first.", "info")} />
          </View>
          <Pressable
            onPress={() => void useEditor.getState().flush().then(() => router.push("/editor/export"))}
            accessibilityRole="button"
            accessibilityLabel="Export"
            style={({ pressed }) => [styles.export, pressed && { backgroundColor: colors.primaryPress }]}
          >
            <Icon name="download" size={18} color={colors.onPrimary} strokeWidth={2.2} />
            <Text style={type(15, "semibold", { color: colors.onPrimary })}>Export</Text>
          </Pressable>
        </View>
      </View>

      <Timeline />

      {selected ? (
        <View style={styles.selection} accessibilityLabel="Selected clip">
          <Control icon="plus" label="Duplicate clip" onPress={() => duplicate()} />
          {isVideo ? <Control icon="back" label="Move clip earlier" onPress={() => edit((d) => moveVideo(d, selected.id, -1))} /> : null}
          {isVideo ? <Control icon="chevronRight" label="Move clip later" onPress={() => edit((d) => moveVideo(d, selected.id, 1))} /> : null}
          <Control icon="close" label="Deselect" onPress={() => useEditor.getState().select(null)} />
        </View>
      ) : null}

      <View style={styles.tools}>
        {[TOOLS.slice(0, 4), TOOLS.slice(4)].map((row, r) => (
          <View key={r} style={styles.toolRow}>
            {row.map((t) => {
              const on = t.label === "Captions" && doc.tracks.caption.length > 0;
              return (
                <Pressable
                  key={t.label}
                  onPress={() => router.push(t.href)}
                  accessibilityRole="button"
                  accessibilityLabel={t.label}
                  // Captions reads as "on" while the project has captions (design: tinted tile).
                  aria-selected={on}
                  style={({ pressed }) => [styles.tool, on && styles.toolOn, pressed && { backgroundColor: colors.surface3 }]}
                >
                  <Icon name={t.icon} size={20} color={on ? colors.emeraldBright : colors.fg} />
                  <Text style={type(11, "regular", { color: on ? colors.emeraldBright : colors.fgMuted })} numberOfLines={1} adjustsFontSizeToFit>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  banner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.error },
  selection: { flexDirection: "row", gap: 8 },
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
