import {
  ASSET_SORTS,
  PLAN_LABEL,
  assetUploadProblem,
  formatBytes,
  type Asset,
  type AssetFilter,
  type AssetListOptions,
  type AssetSort,
} from "@clipiro/shared";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
  BottomSheet,
  Button,
  EmptyState,
  Header,
  Icon,
  IconButton,
  OptionList,
  ProgressBar,
  ScoreRing,
  SkeletonCard,
  StatusBarScrim,
  TextField,
  useToast,
  type IconName,
} from "@/components";
import { assets as assetsApi } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { imageSource } from "@/lib/images";
import { useDebounced } from "@/lib/useDebounced";
import { useScreenPadding } from "@/navigation/insets";
import { colors, derived, radius, text, type } from "@/theme";
import { mmss } from "../projects/format";
import { AssetChips } from "./AssetChips";
import { AssetSheet } from "./AssetSheet";
import { assetKeys, useAssetList, useAssetStorage, useFolders, usePlanTier } from "./queries";
import { onQueueUploaded, useUploadQueue, type QueueItem } from "./uploadQueue";

const KIND_ICON: Record<Asset["kind"], IconName> = { video: "projects", audio: "music", image: "image" };

// design/screens/BN-Assets.html — All / Videos / Images, folders and storage.
// The list is paged from the server, which also filters, searches and sorts.
export function AssetsScreen() {
  const pad = useScreenPadding();
  const toast = useToast();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ show?: string; folder?: string }>();
  const storage = useAssetStorage();
  const folders = useFolders();
  const plan = usePlanTier().data ?? "free";
  const queue = useUploadQueue();
  const [filter, setFilter] = useState<AssetFilter>(params.show === "video" || params.show === "image" ? params.show : "all");
  const [folderId, setFolderId] = useState<string | null>(params.folder ?? null);
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<AssetSort>("date");
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"sort" | "folder" | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const q = useDebounced(query.trim());

  const opts: AssetListOptions = showArchived
    ? { archived: true, sort, q }
    : folderId
      ? { folderId, sort, q }
      : { kind: filter === "all" ? null : (filter as Asset["kind"]), noAi: true, sort, q };
  const list = useAssetList(opts);
  const firstLoad = list.isPending && !list.data;

  // Each finished upload shows up in the lists and the meter.
  useEffect(() => {
    return onQueueUploaded(() => void qc.invalidateQueries({ queryKey: assetKeys.all }));
  }, [qc]);

  const used = storage.data?.usedBytes ?? 0;
  const limit = storage.data?.limitBytes ?? 1;
  const counts = storage.data?.counts;
  const folder = folders.data?.find((f) => f.id === folderId);
  const open = list.items.find((x) => x.id === openId) ?? null;
  const tile = Math.floor((width - 32 - 16) / 3);

  const upload = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["video/*", "image/*", "audio/*"], copyToCacheDirectory: true, multiple: true });
    if (res.canceled) return;
    // Room left counts what's already waiting in the queue.
    let room = used + queue.items.filter((x) => x.status !== "done" && x.status !== "failed").reduce((t, x) => t + x.sizeBytes, 0);
    const ok = [];
    for (const f of res.assets) {
      const problem = assetUploadProblem(f.size ?? 0, room, plan);
      if (problem) {
        toast(`${f.name}: ${problem}`, "error");
        continue;
      }
      ok.push({ uri: f.uri, name: f.name, mimeType: f.mimeType ?? "application/octet-stream", sizeBytes: f.size ?? 0 });
      room += f.size ?? 0;
    }
    if (ok.length) queue.add(ok);
  };

  const newFolder = async () => {
    try {
      await assetsApi.createFolder({ name: folderName });
      await qc.invalidateQueries({ queryKey: assetKeys.folders });
      setSheet(null);
      setFolderName("");
      setFolderError(undefined);
      toast("Folder created.", "success");
    } catch (e) {
      setFolderError(apiErrorMessage(e));
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([list.refetch(), storage.refetch(), folders.refetch()]);
    setRefreshing(false);
  };

  const title = showArchived ? "Archived" : folder ? folder.name : "Assets";
  const back = folder || showArchived ? () => (setFolderId(null), setShowArchived(false)) : router.canGoBack() ? () => router.back() : undefined;
  const sortLabel = ASSET_SORTS.find((s) => s.id === sort)?.label;
  const emptyLibrary = !showArchived && !folderId && !q && filter === "all" && list.total === 0 && !!list.data;

  const header = (
    <View style={styles.header}>
      <Header
        title={title}
        large
        onBack={back}
        actions={
          <>
            <IconButton
              icon={searching ? "close" : "search"}
              accessibilityLabel={searching ? "Close search" : "Search"}
              onPress={() => {
                setSearching((s) => !s);
                setQuery("");
              }}
            />
            <Pressable onPress={upload} accessibilityRole="button" accessibilityLabel="Upload" style={({ pressed }) => [styles.upload, pressed && { backgroundColor: colors.primaryPress }]}>
              <Icon name="upload" size={16} color={colors.onPrimary} strokeWidth={2.2} />
              <Text style={type(14, "semibold", { color: colors.onPrimary })}>Upload</Text>
            </Pressable>
          </>
        }
      />
      {searching ? <TextField label="Search files" hideLabel leadingIcon="search" value={query} onChangeText={setQuery} placeholder="Search files" autoFocus returnKeyType="search" /> : null}
      <UploadTray items={queue.items} onCancel={(id) => void queue.cancel(id)} onRetry={queue.retry} onClear={queue.clearFinished} />

      {!folder && !showArchived ? (
        <>
          {storage.data ? (
            <View
              style={styles.storage}
              accessible
              accessibilityLabel={`${PLAN_LABEL[plan]} storage: ${formatBytes(used)} of ${formatBytes(limit)} used. ${storage.data.count} files, up to ${formatBytes(storage.data.maxUploadBytes)} each`}
            >
              <ScoreRing value={used} max={limit} size={64} icon="folder" label="Storage used" color={used / limit > 0.9 ? colors.warning : colors.emeraldBright} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={type(12, "regular", { color: colors.fgSubtle })}>{PLAN_LABEL[plan]} storage</Text>
                <Text style={type(18, "bold")}>
                  {formatBytes(used)} <Text style={type(13, "medium", { color: colors.fgMuted })}>of {formatBytes(limit)}</Text>
                </Text>
                <Text style={type(12, "regular", { color: colors.fgMuted })}>
                  {storage.data.count} files · up to {formatBytes(storage.data.maxUploadBytes)} each
                </Text>
              </View>
            </View>
          ) : (
            <SkeletonCard lines={2} />
          )}
          <View style={styles.row}>
            {(["video", "audio", "image"] as const).map((k) => (
              <View key={k} style={styles.count}>
                <Icon name={KIND_ICON[k]} size={18} color={colors.emeraldBright} />
                <Text style={type(22, "bold")}>{counts?.[k] ?? "–"}</Text>
                <Text style={type(11, "regular", { color: colors.fgMuted })}>{k === "video" ? "Videos" : k === "audio" ? "Audio" : "Images"}</Text>
              </View>
            ))}
          </View>
          <AssetChips value={filter} onChange={setFilter} />
          <View style={styles.head}>
            <Text style={text.label} accessibilityRole="header">
              Folders
            </Text>
            <Pressable onPress={() => setSheet("folder")} accessibilityRole="button" style={styles.link}>
              <Text style={type(12, "medium", { color: colors.emeraldBright })}>New folder</Text>
            </Pressable>
          </View>
          {folders.data?.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {folders.data.map((f, i) => (
                <Pressable
                  key={f.id}
                  onPress={() => setFolderId(f.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${f.name}, ${f.fileCount} ${f.fileCount === 1 ? "file" : "files"}`}
                  style={({ pressed }) => [styles.folder, { width: tile }, pressed && { backgroundColor: colors.surface3 }]}
                >
                  <Icon name="folder" size={20} color={[colors.emeraldBright, colors.info, colors.warning][i % 3]} />
                  <Text style={type(13, "semibold")} numberOfLines={1}>
                    {f.name}
                  </Text>
                  <Text style={type(11, "regular", { color: colors.fgMuted })}>
                    {f.fileCount} {f.fileCount === 1 ? "file" : "files"}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={text.caption}>Group files into folders to find them faster.</Text>
          )}
        </>
      ) : null}

      {firstLoad ? (
        <SkeletonCard lines={3} />
      ) : list.isError && !list.data ? (
        <EmptyState tone="error" title="Couldn’t load your assets" body={apiErrorMessage(list.error)} action={{ label: "Try again", onPress: () => list.refetch() }} />
      ) : emptyLibrary ? (
        <EmptyState icon="upload" title="Your library is empty" body="Upload videos, images and audio to use in AutoClip and the editor." action={{ label: "Upload your first file", onPress: upload }} />
      ) : (
        <>
          <View style={styles.head}>
            <Text style={text.label} accessibilityRole="header">
              {q ? `Results · ${list.total}` : `${folder ? "Files" : showArchived ? "Archived files" : "All files"} · ${sortLabel}`}
            </Text>
            <Pressable onPress={() => setSheet("sort")} accessibilityRole="button" accessibilityLabel={`Sort: ${sortLabel}`} style={styles.sort}>
              <Text style={type(12, "medium")}>Sort</Text>
            </Pressable>
          </View>
          {list.total === 0 ? (
            <Text style={[text.caption, { paddingVertical: 16 }]}>{q ? `No files match “${q}”.` : showArchived ? "Nothing archived." : "No files here yet."}</Text>
          ) : null}
        </>
      )}
    </View>
  );

  const footer = (
    <View style={{ gap: 12, paddingTop: 4 }}>
      {list.isFetchingNextPage ? <ActivityIndicator color={colors.emeraldBright} /> : null}
      {!folder && !showArchived && counts?.archived ? (
        <Button label={`Archived · ${counts.archived}`} icon="trash" iconPosition="start" variant="ghost" size="md" onPress={() => setShowArchived(true)} />
      ) : null}
    </View>
  );

  return (
    <View style={styles.root}>
      <FlashList
        data={firstLoad || (list.isError && !list.data) || emptyLibrary ? [] : list.items}
        keyExtractor={(x) => x.id}
        numColumns={3}
        renderItem={({ item }) => (
          <View style={styles.cell}>
            <AssetTile x={item} size={tile} onPress={() => setOpenId(item.id)} />
          </View>
        )}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
        onEndReachedThreshold={0.6}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ ...pad, paddingHorizontal: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.emeraldBright} colors={[colors.emeraldBright]} progressBackgroundColor={colors.surface2} />}
      />
      <StatusBarScrim />
      <AssetSheet asset={open} onClose={() => setOpenId(null)} />
      <BottomSheet visible={sheet === "sort"} onClose={() => setSheet(null)} title="Sort by">
        <OptionList accessibilityLabel="Sort by" value={sort} options={ASSET_SORTS.map((s) => ({ value: s.id, label: s.label }))} onChange={(v) => (setSort(v), setSheet(null))} />
      </BottomSheet>
      <BottomSheet visible={sheet === "folder"} onClose={() => setSheet(null)} title="New folder">
        <TextField label="Folder name" value={folderName} onChangeText={(t) => (setFolderName(t), setFolderError(undefined))} autoFocus maxLength={60} returnKeyType="done" onSubmitEditing={newFolder} error={folderError} />
        <Button label="Create folder" variant="secondary" size="sm" fullWidth onPress={newFolder} />
      </BottomSheet>
    </View>
  );
}

function AssetTile({ x, size, onPress }: { x: Asset; size: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${x.name}, ${x.kind}${x.durationSec ? `, ${mmss(x.durationSec)}` : ""}${x.favorite ? ", starred" : ""}${x.status === "processing" ? ", processing" : ""}`}
      style={[styles.tile, { height: size }]}
    >
      {x.thumbnailUrl ? (
        <Image source={imageSource(x.thumbnailUrl)} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={styles.wave}>
          {[40, 70, 50, 90, 60, 80, 45, 65].map((h, i) => (
            <View key={i} style={[styles.bar, { height: `${h}%` }]} />
          ))}
        </View>
      )}
      {x.status === "processing" ? (
        <View style={styles.processing}>
          <Text style={type(11, "semibold", { color: colors.info })}>Processing…</Text>
        </View>
      ) : null}
      {x.favorite ? (
        <View style={styles.star}>
          <Icon name="star" size={14} color={colors.emeraldBright} />
        </View>
      ) : null}
      <View style={styles.chip}>
        <Icon name={KIND_ICON[x.kind]} size={11} color={colors.fg} />
        <Text style={type(11, "regular", { mono: x.durationSec != null })}>{x.durationSec != null ? mmss(x.durationSec) : "Image"}</Text>
      </View>
    </Pressable>
  );
}

/** Files on their way into Assets (uploadQueue.ts). */
function UploadTray({ items, onCancel, onRetry, onClear }: { items: QueueItem[]; onCancel: (id: string) => void; onRetry: () => void; onClear: () => void }) {
  if (!items.length) return null;
  const waiting = items.some((x) => x.status === "paused" || x.status === "failed");
  const finished = items.some((x) => x.status === "done" || x.status === "failed");
  return (
    <View style={styles.tray} accessibilityLiveRegion="polite">
      {items.map((x) => (
        <View key={x.id} style={{ gap: 6 }}>
          <View style={styles.trayRow}>
            <Icon name={x.status === "done" ? "check" : x.status === "failed" ? "alert" : "cloudUpload"} size={16} color={x.status === "failed" ? colors.error : colors.emeraldBright} />
            <Text style={[type(13, "semibold"), { flex: 1 }]} numberOfLines={1}>
              {x.name}
            </Text>
            <Text style={type(12, "regular", { color: x.status === "paused" ? colors.warning : colors.fgMuted })}>
              {x.status === "done" ? "Added" : x.status === "failed" ? "Failed" : x.status === "paused" ? "Paused" : x.status === "queued" ? "Waiting" : `${Math.round(x.progress * 100)}%`}
            </Text>
            {x.status !== "done" ? <IconButton icon="close" size={32} accessibilityLabel={`Cancel ${x.name}`} onPress={() => onCancel(x.id)} /> : null}
          </View>
          {x.status === "uploading" || x.status === "paused" ? <ProgressBar value={Math.round(x.progress * 100)} height={4} label={`${x.name} ${Math.round(x.progress * 100)}%`} /> : null}
          {x.error ? <Text style={type(12, "regular", { color: colors.fgMuted })}>{x.error}</Text> : null}
        </View>
      ))}
      <View style={styles.trayActions}>
        {waiting ? <Button label="Retry" variant="secondary" size="sm" onPress={onRetry} /> : null}
        {finished ? <Button label="Clear" variant="ghost" size="sm" onPress={onClear} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 4, gap: 12, paddingBottom: 12 },
  cell: { flex: 1, padding: 4 },
  upload: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.primary },
  storage: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: "row", gap: 10 },
  count: { flex: 1, gap: 8, padding: 12, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 44 },
  link: { minHeight: 44, justifyContent: "center", paddingLeft: 12 },
  sort: { minHeight: 32, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, justifyContent: "center" },
  folder: { gap: 6, padding: 12, minHeight: 84, borderRadius: radius.tile, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, justifyContent: "flex-end" },
  tile: { borderRadius: radius.tile, overflow: "hidden", backgroundColor: colors.surface3 },
  wave: { ...StyleSheet.absoluteFill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 14, backgroundColor: colors.surface2 },
  bar: { width: 6, borderRadius: 2, backgroundColor: colors.emeraldBright },
  processing: { ...StyleSheet.absoluteFill, backgroundColor: derived.overlay, alignItems: "center", justifyContent: "center" },
  star: { position: "absolute", right: 6, top: 6 },
  chip: { position: "absolute", left: 6, bottom: 6, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: derived.overlay },
  tray: { gap: 10, padding: 12, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.tintBorder },
  trayRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  trayActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
});
