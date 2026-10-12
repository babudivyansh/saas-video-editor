import {
  ASSET_SORTS,
  AI_SOURCES,
  PLAN_LABEL,
  assetUploadProblem,
  formatBytes,
  maxFileBytes,
  sortAssets,
  storageLimitBytes,
  type Asset,
  type AssetFilter,
  type AssetSort,
} from "@clipiro/shared";
import { useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
  BottomSheet,
  Button,
  EmptyState,
  Header,
  Icon,
  IconButton,
  OptionList,
  ScoreRing,
  SkeletonCard,
  StatusBarScrim,
  TextField,
  useToast,
  type IconName,
} from "@/components";
import { imageSource } from "@/lib/images";
import { useScreenPadding } from "@/navigation/insets";
import { colors, derived, radius, text, type } from "@/theme";
import { errorMessage } from "@mocks/core";
import { addUpload, createFolder } from "@mocks/assets";
import { useCreateContext } from "../create/queries";
import { mmss } from "../projects/format";
import { AssetChips } from "./AssetChips";
import { AssetSheet } from "./AssetSheet";
import { assetKeys, useAssets, useFolders } from "./queries";

const KIND_ICON: Record<Asset["kind"], IconName> = { video: "projects", audio: "music", image: "image" };

// design/screens/BN-Assets.html — All / Videos / Images, folders and storage.
export function AssetsScreen() {
  const pad = useScreenPadding();
  const toast = useToast();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ show?: string; folder?: string }>();
  const assets = useAssets();
  const folders = useFolders();
  const plan = useCreateContext().data?.plan ?? "free";
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

  const all = assets.data ?? [];
  const live = all.filter((x) => !x.archivedAt);
  const used = live.reduce((t, x) => t + x.sizeBytes, 0);
  const limit = storageLimitBytes(plan);
  const archived = all.filter((x) => x.archivedAt);
  const count = (k: Asset["kind"]) => live.filter((x) => x.kind === k && !AI_SOURCES.includes(x.source)).length;
  const q = query.trim().toLowerCase();
  const folder = folders.data?.find((f) => f.id === folderId);
  const shown = sortAssets(
    (showArchived ? archived : live).filter(
      (x) => (filter === "all" || x.kind === filter) && (!folderId || x.folderId === folderId) && (!q || x.name.toLowerCase().includes(q)) && (folderId || showArchived || !AI_SOURCES.includes(x.source)),
    ),
    sort,
  );
  const open = all.find((x) => x.id === openId) ?? null;
  const tile = Math.floor((width - 32 - 16) / 3);

  const upload = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["video/*", "image/*", "audio/*"], copyToCacheDirectory: false, multiple: true });
    if (res.canceled) return;
    let added = 0;
    let room = used;
    for (const f of res.assets) {
      const problem = assetUploadProblem(f.size ?? 0, room, plan);
      if (problem) {
        toast(`${f.name}: ${problem}`, "error");
        continue;
      }
      await addUpload({ name: f.name, size: f.size ?? 0, mimeType: f.mimeType ?? "" });
      room += f.size ?? 0;
      added += 1;
    }
    if (added) {
      await qc.invalidateQueries({ queryKey: assetKeys.all });
      toast(`${added} file${added === 1 ? "" : "s"} uploading.`, "success");
    }
  };

  const newFolder = async () => {
    try {
      await createFolder(folderName);
      await qc.invalidateQueries({ queryKey: assetKeys.all });
      setSheet(null);
      setFolderName("");
      setFolderError(undefined);
      toast("Folder created.", "success");
    } catch (e) {
      setFolderError(errorMessage(e));
    }
  };

  const title = showArchived ? "Archived" : folder ? folder.name : "Assets";
  const back = folder || showArchived ? () => (setFolderId(null), setShowArchived(false)) : router.canGoBack() ? () => router.back() : undefined;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, pad]} keyboardShouldPersistTaps="handled">
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

        {assets.isPending ? (
          <>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={3} />
          </>
        ) : assets.isError ? (
          <EmptyState tone="error" title="Couldn’t load your assets" body={errorMessage(assets.error)} action={{ label: "Try again", onPress: () => assets.refetch() }} />
        ) : (
          <>
            {!folder && !showArchived ? (
              <>
                <View style={styles.storage} accessible accessibilityLabel={`${PLAN_LABEL[plan]} storage: ${formatBytes(used)} of ${formatBytes(limit)} used. ${live.length} files, up to ${formatBytes(maxFileBytes(plan))} each`}>
                  <ScoreRing value={used} max={limit} size={64} icon="folder" label="Storage used" color={used / limit > 0.9 ? colors.warning : colors.emeraldBright} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={type(12, "regular", { color: colors.fgSubtle })}>{PLAN_LABEL[plan]} storage</Text>
                    <Text style={type(18, "bold")}>
                      {formatBytes(used)} <Text style={type(13, "medium", { color: colors.fgMuted })}>of {formatBytes(limit)}</Text>
                    </Text>
                    <Text style={type(12, "regular", { color: colors.fgMuted })}>
                      {live.length} files · up to {formatBytes(maxFileBytes(plan))} each
                    </Text>
                  </View>
                </View>
                <View style={styles.row}>
                  {(["video", "audio", "image"] as const).map((k) => (
                    <View key={k} style={styles.count}>
                      <Icon name={KIND_ICON[k]} size={18} color={colors.emeraldBright} />
                      <Text style={type(22, "bold")}>{count(k)}</Text>
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
                      <Pressable key={f.id} onPress={() => setFolderId(f.id)} accessibilityRole="button" accessibilityLabel={`${f.name}, ${f.fileCount} ${f.fileCount === 1 ? "file" : "files"}`} style={({ pressed }) => [styles.folder, { width: tile }, pressed && { backgroundColor: colors.surface3 }]}>
                        <Icon name="folder" size={20} color={[colors.emeraldBright, colors.info, colors.warning][i % 3]} />
                        <Text style={type(13, "semibold")} numberOfLines={1}>
                          {f.name}
                        </Text>
                        <Text style={type(11, "regular", { color: colors.fgMuted })}>{f.fileCount} {f.fileCount === 1 ? "file" : "files"}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : (
                  <Text style={text.caption}>Group files into folders to find them faster.</Text>
                )}
              </>
            ) : null}

            <View style={styles.head}>
              <Text style={text.label} accessibilityRole="header">
                {q ? `Results · ${shown.length}` : `${folder ? "Files" : showArchived ? "Archived files" : "All files"} · ${ASSET_SORTS.find((s) => s.id === sort)?.label}`}
              </Text>
              <Pressable onPress={() => setSheet("sort")} accessibilityRole="button" accessibilityLabel={`Sort: ${ASSET_SORTS.find((s) => s.id === sort)?.label}`} style={styles.sort}>
                <Text style={type(12, "medium")}>Sort</Text>
              </Pressable>
            </View>
            {live.length === 0 && !showArchived ? (
              <EmptyState icon="upload" title="Your library is empty" body="Upload videos, images and audio to use in AutoClip and the editor." action={{ label: "Upload your first file", onPress: upload }} />
            ) : shown.length === 0 ? (
              <Text style={[text.caption, { paddingVertical: 16 }]}>{q ? `No files match “${query.trim()}”.` : showArchived ? "Nothing archived." : "No files here yet."}</Text>
            ) : (
              <View style={styles.grid}>
                {shown.map((x) => (
                  <Pressable
                    key={x.id}
                    onPress={() => setOpenId(x.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${x.name}, ${x.kind}${x.durationSec ? `, ${mmss(x.durationSec)}` : ""}${x.favorite ? ", starred" : ""}${x.status === "processing" ? ", processing" : ""}`}
                    style={[styles.tile, { width: tile, height: tile }]}
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
                ))}
              </View>
            )}
            {!folder && !showArchived && archived.length ? (
              <Button label={`Archived · ${archived.length}`} icon="trash" iconPosition="start" variant="ghost" size="md" onPress={() => setShowArchived(true)} />
            ) : null}
          </>
        )}
      </ScrollView>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 12 },
  upload: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.primary },
  storage: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: "row", gap: 10 },
  count: { flex: 1, gap: 8, padding: 12, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 44 },
  link: { minHeight: 44, justifyContent: "center", paddingLeft: 12 },
  sort: { minHeight: 32, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, justifyContent: "center" },
  folder: { gap: 6, padding: 12, minHeight: 84, borderRadius: radius.tile, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, justifyContent: "flex-end" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { borderRadius: radius.tile, overflow: "hidden", backgroundColor: colors.surface3 },
  wave: { ...StyleSheet.absoluteFill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 14, backgroundColor: colors.surface2 },
  bar: { width: 6, borderRadius: 2, backgroundColor: colors.emeraldBright },
  processing: { ...StyleSheet.absoluteFill, backgroundColor: derived.overlay, alignItems: "center", justifyContent: "center" },
  star: { position: "absolute", right: 6, top: 6 },
  chip: { position: "absolute", left: 6, bottom: 6, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: derived.overlay },
});
