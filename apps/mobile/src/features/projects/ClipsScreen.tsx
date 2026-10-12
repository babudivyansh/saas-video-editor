import { FILTER_ASPECT, type Clip, type ClipAspect, type ProjectFilter } from "@clipiro/shared";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConfirmSheet, EmptyState, Header, Icon, IconButton, SkeletonCard, StatusBarScrim, useToast, type IconName } from "@/components";
import { projects as projectsApi } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { imageSource } from "@/lib/images";
import { useScreenPadding } from "@/navigation/insets";
import { colors, derived, elevation, layout, radius, text, type } from "@/theme";
import { saveClipsToGallery, shareClip } from "./clipFiles";
import { fileErrorMessage } from "./ClipSheet";
import { mmss } from "./format";
import { ProjectChips } from "./ProjectChips";
import { deleteInBatches, projectKeys, useClipList } from "./queries";
import { useComposerSeed } from "../social/queries";

const SHAPES = { vertical: "Shorts & Reels", wide: "Videos", square: "Square" } as const;
type Shape = keyof typeof SHAPES;

// design/screens/BN-Shorts.html — every clip of one shape, with multi-select
// (decision 2026-10-02 A: the chips group by shape — 9:16 / 16:9 / 1:1).
// Paged from the server; "Select all" picks what's loaded.
export function ClipsScreen() {
  const pad = useScreenPadding();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const toast = useToast();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ shape?: string }>();
  const shape: Shape = params.shape === "wide" || params.shape === "square" ? params.shape : "vertical";
  const aspect = FILTER_ASPECT[shape as ProjectFilter] as ClipAspect;
  const clips = useClipList({ aspect });
  const [picked, setPicked] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const firstLoad = clips.isPending && !clips.data;

  const all = clips.items;
  const allPicked = all.length > 0 && picked.length === all.length;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const cols = aspect === "16:9" ? 2 : 3;
  // Pixel sizes: a % width + aspectRatio gives the tiles no height on Android.
  const cellW = Math.floor((width - 32) / cols);
  const tileH = Math.round((cellW - 8) / (aspect === "9:16" ? 9 / 15 : aspect === "1:1" ? 1 : 16 / 10));

  const work = async (label: string, fn: () => Promise<string | null>) => {
    setBusy(label);
    try {
      const done = await fn();
      if (done) toast(done, "success");
    } catch (e) {
      toast(fileErrorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const remove = () =>
    work("Deleting…", async () => {
      const { deleted, skipped } = await deleteInBatches(picked, projectsApi.removeClips);
      await qc.invalidateQueries({ queryKey: projectKeys.all });
      setPicked([]);
      setConfirm(false);
      return `${deleted} clip${deleted === 1 ? "" : "s"} deleted.${skipped ? ` ${skipped} still rendering — try again when they’re done.` : ""}`;
    });

  const ready = (ids: string[]) => all.filter((c) => ids.includes(c.id) && c.status === "ready");
  const ACTIONS: { icon: IconName; label: string; onPress: () => void; danger?: boolean }[] = [
    {
      icon: "download",
      label: "Download",
      onPress: () =>
        work("Saving…", async () => {
          const ok = ready(picked);
          if (!ok.length) return "None of these are ready to save yet.";
          await saveClipsToGallery(
            ok.map((c) => c.id),
            (n) => setBusy(`Saving ${n} of ${ok.length}…`),
          );
          return `Saved ${ok.length} clip${ok.length === 1 ? "" : "s"} to your gallery.`;
        }),
    },
    { icon: "calendar", label: "Schedule", onPress: () => (useComposerSeed.getState().seed({}), router.push("/composer")) },
    {
      icon: "social",
      label: "Share",
      onPress: () =>
        picked.length !== 1
          ? toast("Share one clip at a time.", "info")
          : work("Preparing…", async () => {
              const c = ready(picked)[0];
              if (!c) return "This clip isn’t ready to share yet.";
              await shareClip(c.id, c.title);
              return null;
            }),
    },
    { icon: "trash", label: "Delete", onPress: () => setConfirm(true), danger: true },
  ];

  const header = (
    <View style={styles.header}>
      <Header title="Projects" large actions={<IconButton icon="close" accessibilityLabel="Close" onPress={() => router.dismissTo("/projects")} />} />
      <ProjectChips value={shape} />
      {firstLoad ? (
        <SkeletonCard lines={4} />
      ) : clips.isError && !clips.data ? (
        <EmptyState tone="error" title="Couldn’t load your clips" body={apiErrorMessage(clips.error)} action={{ label: "Try again", onPress: () => clips.refetch() }} />
      ) : clips.total === 0 ? (
        <EmptyState icon="projects" title={`No ${SHAPES[shape].toLowerCase()} clips yet`} body="AutoClip and the editor put finished clips here." action={{ label: "Start with AutoClip", onPress: () => router.push("/create/autoclip") }} />
      ) : (
        <View style={styles.head}>
          <Text style={text.label} accessibilityRole="header">
            {SHAPES[shape]} · {aspect} · {clips.total} clips
          </Text>
          <Pressable onPress={() => setPicked(allPicked ? [] : all.map((c) => c.id))} accessibilityRole="button" style={styles.link}>
            <Text style={type(13, "medium", { color: colors.emeraldBright })}>{allPicked ? "Clear" : "Select all"}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  const tile = (c: Clip) => {
    const on = picked.includes(c.id);
    return (
      <Pressable
        onPress={() => toggle(c.id)}
        accessibilityRole="checkbox"
        aria-checked={on}
        accessibilityLabel={`${c.title}, ${mmss(c.durationSec)}`}
        style={[styles.tile, { height: tileH }, on && styles.tileOn]}
      >
        <Image source={imageSource(c.thumbnailUrl)} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={[styles.check, on && styles.checkOn]}>{on ? <Icon name="check" size={14} color={colors.bg} strokeWidth={2.6} /> : null}</View>
        <Text style={styles.time}>{mmss(c.durationSec)}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <FlashList
        key={cols}
        data={firstLoad || (clips.isError && !clips.data) ? [] : all}
        keyExtractor={(c) => c.id}
        numColumns={cols}
        extraData={picked}
        renderItem={({ item }) => <View style={styles.cell}>{tile(item)}</View>}
        ListHeaderComponent={header}
        ListFooterComponent={clips.isFetchingNextPage ? <ActivityIndicator color={colors.emeraldBright} style={{ marginVertical: 16 }} /> : null}
        onEndReached={() => clips.hasNextPage && !clips.isFetchingNextPage && void clips.fetchNextPage()}
        onEndReachedThreshold={0.6}
        contentContainerStyle={{ ...pad, paddingHorizontal: 12, paddingBottom: pad.paddingBottom + (picked.length ? 80 : 0) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await clips.refetch();
              setRefreshing(false);
            }}
            tintColor={colors.emeraldBright}
            colors={[colors.emeraldBright]}
            progressBackgroundColor={colors.surface2}
          />
        }
      />
      <StatusBarScrim />
      {picked.length ? (
        <View style={[styles.bar, { bottom: layout.tabBar.height + layout.tabBar.inset + insets.bottom + 12 }]}>
          <Text style={[type(14, "semibold"), { flex: 1 }]} accessibilityLiveRegion="polite">
            {busy ?? `${picked.length} selected`}
          </Text>
          {busy ? (
            <ActivityIndicator color={colors.emeraldBright} style={{ marginRight: 12 }} />
          ) : (
            ACTIONS.map((a) => (
              <Pressable key={a.label} onPress={a.onPress} accessibilityRole="button" accessibilityLabel={`${a.label} ${picked.length} clips`} style={styles.barBtn}>
                <Icon name={a.icon} size={20} color={a.danger ? colors.error : colors.fg} />
              </Pressable>
            ))
          )}
        </View>
      ) : null}
      <ConfirmSheet
        visible={confirm}
        title={`Delete ${picked.length} clip${picked.length === 1 ? "" : "s"}?`}
        body="They'll be removed from their projects. Clips still rendering are skipped. This can't be undone."
        confirmLabel="Delete"
        busy={busy === "Deleting…"}
        onClose={() => setConfirm(false)}
        onConfirm={remove}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 4, gap: 14, paddingBottom: 14 },
  cell: { flex: 1, padding: 4 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  link: { minHeight: 44, justifyContent: "center", paddingLeft: 12 },
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
