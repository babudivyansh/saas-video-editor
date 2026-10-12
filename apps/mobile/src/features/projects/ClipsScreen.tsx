import { FILTER_ASPECT, type ClipAspect, type ProjectFilter } from "@clipiro/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConfirmSheet, EmptyState, Header, Icon, IconButton, SkeletonCard, StatusBarScrim, useToast, type IconName } from "@/components";
import { imageSource } from "@/lib/images";
import { useScreenPadding } from "@/navigation/insets";
import { colors, derived, elevation, layout, radius, text, type } from "@/theme";
import { errorMessage } from "@mocks/core";
import { deleteClips } from "@mocks/projects";
import { mmss } from "./format";
import { ProjectChips } from "./ProjectChips";
import { projectKeys, useClips } from "./queries";

const SHAPES = { vertical: "Shorts & Reels", wide: "Videos", square: "Square" } as const;
type Shape = keyof typeof SHAPES;

// design/screens/BN-Shorts.html — every clip of one shape, with multi-select
// (decision 2026-10-02 A: the chips group by shape — 9:16 / 16:9 / 1:1).
export function ClipsScreen() {
  const pad = useScreenPadding();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const toast = useToast();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ shape?: string }>();
  const shape: Shape = params.shape === "wide" || params.shape === "square" ? params.shape : "vertical";
  const aspect = FILTER_ASPECT[shape as ProjectFilter] as ClipAspect;
  const clips = useClips(aspect);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const all = clips.data ?? [];
  const allPicked = all.length > 0 && picked.length === all.length;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const cols = aspect === "16:9" ? 2 : 3;
  // Pixel sizes: a % width + aspectRatio gives the tiles no height on Android.
  const tileW = Math.floor((width - 32 - 8 * (cols - 1)) / cols);

  const remove = async () => {
    setBusy(true);
    try {
      await deleteClips(picked);
      await qc.invalidateQueries({ queryKey: projectKeys.all });
      toast(`${picked.length} clip${picked.length === 1 ? "" : "s"} deleted.`, "success");
      setPicked([]);
      setConfirm(false);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const ACTIONS: { icon: IconName; label: string; onPress: () => void; danger?: boolean }[] = [
    { icon: "download", label: "Download", onPress: () => toast(`Saving ${picked.length} clips to your gallery.`, "success") },
    { icon: "calendar", label: "Schedule", onPress: () => router.push("/composer") },
    { icon: "social", label: "Share", onPress: () => toast("Sharing opens with real files in a later update.", "info") },
    { icon: "trash", label: "Delete", onPress: () => setConfirm(true), danger: true },
  ];

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, pad, picked.length ? { paddingBottom: pad.paddingBottom + 80 } : null]}>
        <Header title="Projects" large actions={<IconButton icon="close" accessibilityLabel="Close" onPress={() => router.dismissTo("/projects")} />} />
        <ProjectChips value={shape} />
        {clips.isPending ? (
          <SkeletonCard lines={4} />
        ) : clips.isError ? (
          <EmptyState tone="error" title="Couldn’t load your clips" body={errorMessage(clips.error)} action={{ label: "Try again", onPress: () => clips.refetch() }} />
        ) : all.length === 0 ? (
          <EmptyState icon="projects" title={`No ${SHAPES[shape].toLowerCase()} clips yet`} body="AutoClip and the editor put finished clips here." action={{ label: "Start with AutoClip", onPress: () => router.push("/create/autoclip") }} />
        ) : (
          <>
            <View style={styles.head}>
              <Text style={text.label} accessibilityRole="header">
                {SHAPES[shape]} · {aspect} · {all.length} clips
              </Text>
              <Pressable onPress={() => setPicked(allPicked ? [] : all.map((c) => c.id))} accessibilityRole="button" style={styles.link}>
                <Text style={type(13, "medium", { color: colors.emeraldBright })}>{allPicked ? "Clear" : "Select all"}</Text>
              </Pressable>
            </View>
            <View style={styles.grid}>
              {all.map((c) => {
                const on = picked.includes(c.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => toggle(c.id)}
                    accessibilityRole="checkbox"
                    aria-checked={on}
                    accessibilityLabel={`${c.title}, ${mmss(c.durationSec)}`}
                    style={[styles.tile, { width: tileW, height: Math.round(tileW / (aspect === "9:16" ? 9 / 15 : aspect === "1:1" ? 1 : 16 / 10)) }, on && styles.tileOn]}
                  >
                    <Image source={imageSource(c.thumbnailUrl)} style={StyleSheet.absoluteFill} contentFit="cover" />
                    <View style={[styles.check, on && styles.checkOn]}>{on ? <Icon name="check" size={14} color={colors.bg} strokeWidth={2.6} /> : null}</View>
                    <Text style={styles.time}>{mmss(c.durationSec)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
      <StatusBarScrim />
      {picked.length ? (
        <View style={[styles.bar, { bottom: layout.tabBar.height + layout.tabBar.inset + insets.bottom + 12 }]}>
          <Text style={[type(14, "semibold"), { flex: 1 }]} accessibilityLiveRegion="polite">
            {picked.length} selected
          </Text>
          {ACTIONS.map((a) => (
            <Pressable key={a.label} onPress={a.onPress} accessibilityRole="button" accessibilityLabel={`${a.label} ${picked.length} clips`} style={styles.barBtn}>
              <Icon name={a.icon} size={20} color={a.danger ? colors.error : colors.fg} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <ConfirmSheet
        visible={confirm}
        title={`Delete ${picked.length} clip${picked.length === 1 ? "" : "s"}?`}
        body="They'll be removed from their projects. This can't be undone."
        confirmLabel="Delete"
        busy={busy}
        onClose={() => setConfirm(false)}
        onConfirm={remove}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 14 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  link: { minHeight: 44, justifyContent: "center", paddingLeft: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { borderRadius: radius.tile, overflow: "hidden", backgroundColor: colors.surface3, borderWidth: 2, borderColor: "transparent" },
  tileOn: { borderColor: colors.emeraldBright },
  check: { position: "absolute", right: 6, top: 6, width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.fg, backgroundColor: derived.glass, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: colors.emeraldBright, borderColor: colors.emeraldBright },
  time: { position: "absolute", left: 6, bottom: 6, ...type(11, "regular", { mono: true }), textShadowColor: colors.bg, textShadowRadius: 4 },
  bar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 60,
    paddingLeft: 18,
    paddingRight: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    ...elevation.tabBar,
  },
  barBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
