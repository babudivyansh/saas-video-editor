import { PROJECT_SORTS, draftProgress, type ProjectSort, type ProjectSummary } from "@clipiro/shared";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import {
  BottomSheet,
  Button,
  ConfirmSheet,
  EmptyState,
  Header,
  Icon,
  IconButton,
  OptionList,
  ProgressBar,
  SkeletonCard,
  StatusBadge,
  StatusBarScrim,
  TextField,
  useToast,
  type StatusTone,
} from "@/components";
import { projects as projectsApi } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { imageSource } from "@/lib/images";
import { useDebounced } from "@/lib/useDebounced";
import { useScreenPadding } from "@/navigation/insets";
import { colors, derived, radius, text, type } from "@/theme";
import { mmss, whenEdited } from "./format";
import { ProjectChips } from "./ProjectChips";
import { projectKeys, useProjectList } from "./queries";

export const PROJECT_STATUS: Record<ProjectSummary["status"], { label: string; tone: StatusTone }> = {
  completed: { label: "Ready", tone: "success" },
  draft: { label: "Draft", tone: "warning" },
  processing: { label: "Processing", tone: "info" },
  rendering: { label: "Rendering", tone: "info" },
  failed: { label: "Failed", tone: "error" },
};

/** Where a project opens: drafts resume in the editor, the rest show their clips. */
export const projectHref = (p: ProjectSummary): Href => (p.status === "draft" ? "/editor" : { pathname: "/projects/[projectId]", params: { projectId: p.id } });

const meta = (p: ProjectSummary) =>
  `${p.kind === "autoclip" ? "AutoClip" : "Editor"} · ${p.kind === "autoclip" ? `${p.clipCount} clip${p.clipCount === 1 ? "" : "s"}` : "1 video"} · ${whenEdited(p.updatedAt)}`;

const refreshTint = { tintColor: colors.emeraldBright, colors: [colors.emeraldBright], progressBackgroundColor: colors.surface2 };

// design/screens/BN-Projects.html — the Projects tab root. Search and sort
// run on the server, so they cover every project, not just the loaded pages.
export function ProjectsScreen() {
  const pad = useScreenPadding();
  const toast = useToast();
  const qc = useQueryClient();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ProjectSort>("recent");
  const q = useDebounced(query.trim());
  const list = useProjectList({ q, sort });
  const drafts = useProjectList({ drafts: true });
  const [sheet, setSheet] = useState<"sort" | "actions" | "rename" | "delete" | null>(null);
  const [target, setTarget] = useState<ProjectSummary | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const draft = drafts.items[0];
  const firstLoad = list.isPending && !list.data;

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([list.refetch(), drafts.refetch()]);
    setRefreshing(false);
  };
  const act = (p: ProjectSummary) => {
    setTarget(p);
    setNewTitle(p.title);
    setSheet("actions");
  };
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: projectKeys.all });
      toast(done, "success");
      setSheet(null);
    } catch (e) {
      toast(apiErrorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <View style={styles.header}>
      <Header
        title="Projects"
        large
        actions={
          <>
            <IconButton
              icon={searching ? "close" : "search"}
              accessibilityLabel={searching ? "Close search" : "Search projects"}
              onPress={() => {
                setSearching((s) => !s);
                setQuery("");
              }}
            />
            <IconButton icon="folder" accessibilityLabel="Assets" onPress={() => router.push("/projects/assets")} />
          </>
        }
      />
      {searching ? <TextField label="Search projects" hideLabel leadingIcon="search" value={query} onChangeText={setQuery} placeholder="Search projects" autoFocus returnKeyType="search" /> : null}
      <ProjectChips value="all" />
      {draft && !q && !firstLoad && !list.isError ? (
        <Pressable
          onPress={() => router.push("/editor")}
          accessibilityRole="button"
          accessibilityLabel={`Continue editing ${draft.title}, ${draftProgress(draft.draftSteps ?? [])}% done`}
          style={({ pressed }) => [styles.resume, pressed && { backgroundColor: colors.surface3 }]}
        >
          <View style={styles.resumeThumb}>
            <Image source={imageSource(draft.thumbnailUrl)} style={StyleSheet.absoluteFill} contentFit="cover" />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={type(12, "semibold", { color: colors.emeraldBright })}>Continue editing</Text>
            <Text style={type(16, "bold")} numberOfLines={2}>
              {draft.title}
            </Text>
            <Text style={type(12, "regular", { color: colors.fgMuted })}>
              Last edited {whenEdited(draft.updatedAt).toLowerCase()} · {mmss(draft.durationSec)}
            </Text>
            <ProgressBar value={draftProgress(draft.draftSteps ?? [])} height={5} label="Draft progress" />
          </View>
          <Icon name="chevronRight" size={18} color={colors.emeraldBright} />
        </Pressable>
      ) : null}
      {firstLoad ? (
        <>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
        </>
      ) : list.isError && !list.data ? (
        <EmptyState tone="error" title="Couldn’t load your projects" body={apiErrorMessage(list.error)} action={{ label: "Try again", onPress: () => list.refetch() }} />
      ) : list.total === 0 && !q ? (
        <EmptyState icon="projects" title="No projects yet" body="Turn a long video into clips, or start a fresh edit." action={{ label: "Start with AutoClip", onPress: () => router.push("/create/autoclip") }} />
      ) : (
        <View style={styles.listHead}>
          <Text style={text.label} accessibilityRole="header">
            {q ? `Results · ${list.total}` : `All projects · ${list.total}`}
          </Text>
          <Pressable onPress={() => setSheet("sort")} accessibilityRole="button" accessibilityLabel={`Sort: ${PROJECT_SORTS.find((s) => s.id === sort)?.label}`} style={styles.sortBtn}>
            <Text style={type(12, "regular", { color: colors.fgMuted })}>{PROJECT_SORTS.find((s) => s.id === sort)?.label}</Text>
            <Icon name="chevronDown" size={14} color={colors.fgMuted} />
          </Pressable>
        </View>
      )}
      {q && list.data && list.total === 0 ? <EmptyState icon="search" title={`No projects match “${q}”`} body="Try another name." /> : null}
    </View>
  );

  return (
    <View style={styles.root}>
      <FlashList
        data={firstLoad || (list.isError && !list.data) ? [] : list.items}
        keyExtractor={(p) => p.id}
        numColumns={2}
        renderItem={({ item }) => (
          <View style={styles.cell}>
            <ProjectCard p={item} onLongPress={() => act(item)} />
          </View>
        )}
        ListHeaderComponent={header}
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={colors.emeraldBright} style={{ marginVertical: 16 }} /> : null}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
        onEndReachedThreshold={0.6}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ ...pad, paddingHorizontal: 11 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} {...refreshTint} />}
      />
      <StatusBarScrim />

      <BottomSheet visible={sheet === "sort"} onClose={() => setSheet(null)} title="Sort by">
        <OptionList
          accessibilityLabel="Sort by"
          value={sort}
          options={PROJECT_SORTS.map((s) => ({ value: s.id, label: s.label }))}
          onChange={(v) => {
            setSort(v);
            setSheet(null);
          }}
        />
      </BottomSheet>
      <BottomSheet visible={sheet === "actions"} onClose={() => setSheet(null)} title={target?.title}>
        <View style={{ gap: 8 }}>
          <Button label="Open" variant="secondary" size="sm" fullWidth onPress={() => (setSheet(null), target && router.push(projectHref(target)))} />
          <Button label="Rename" icon="pencil" iconPosition="start" variant="secondary" size="sm" fullWidth onPress={() => setSheet("rename")} />
          <Button label="Delete" icon="trash" iconPosition="start" variant="danger" size="sm" fullWidth onPress={() => setSheet("delete")} />
        </View>
      </BottomSheet>
      <BottomSheet visible={sheet === "rename"} onClose={() => setSheet(null)} title="Rename project">
        <TextField label="Name" value={newTitle} onChangeText={setNewTitle} autoFocus maxLength={200} returnKeyType="done" />
        <Button
          label="Save"
          variant="secondary"
          size="sm"
          fullWidth
          loading={busy}
          onPress={() => target && run(() => projectsApi.rename(target.id, { title: newTitle }), "Project renamed.")}
        />
      </BottomSheet>
      <ConfirmSheet
        visible={sheet === "delete"}
        title="Delete project?"
        body={`“${target?.title}” and its clips will be deleted. This can't be undone.`}
        confirmLabel="Delete project"
        busy={busy}
        onClose={() => setSheet(null)}
        onConfirm={() => target && run(() => projectsApi.remove(target.id), "Project deleted.")}
      />
    </View>
  );
}

function ProjectCard({ p, onLongPress }: { p: ProjectSummary; onLongPress: () => void }) {
  const status = PROJECT_STATUS[p.status];
  return (
    <Pressable
      onPress={() => router.push(projectHref(p))}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${p.title}. ${status.label}. ${meta(p)}`}
      accessibilityHint="Long-press to rename or delete"
      accessibilityActions={[{ name: "longpress", label: "Rename or delete" }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === "longpress" && onLongPress()}
      style={styles.card}
    >
      <View style={styles.cardThumb}>
        <Image source={imageSource(p.thumbnailUrl)} style={StyleSheet.absoluteFill} contentFit="cover" />
        <Svg style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]} width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={`pc-${p.id}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.55" stopColor={colors.bg} stopOpacity={0} />
              <Stop offset="1" stopColor={colors.bg} stopOpacity={0.8} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#pc-${p.id})`} />
        </Svg>
        <View style={styles.badgeTL}>
          <StatusBadge label={status.label} tone={status.tone} />
        </View>
        <Text style={styles.aspect}>{p.aspect}</Text>
      </View>
      <View style={{ gap: 2 }}>
        <Text style={type(13, "semibold", { lineHeight: 1.3 })} numberOfLines={2}>
          {p.title}
        </Text>
        <Text style={type(11, "regular", { color: colors.fgMuted })} numberOfLines={2}>
          {meta(p)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 5, gap: 14, paddingBottom: 14 },
  cell: { flex: 1, paddingHorizontal: 5, paddingBottom: 14 },
  resume: { flexDirection: "row", alignItems: "center", gap: 14, padding: 12, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.tintBorder },
  resumeThumb: { width: 70, height: 110, borderRadius: 14, overflow: "hidden", backgroundColor: colors.surface3 },
  listHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sortBtn: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingLeft: 12 },
  card: { gap: 8 },
  cardThumb: { height: 150, borderRadius: radius.tile, overflow: "hidden", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface3 },
  // Dark backing so the tinted badge stays readable on bright photos.
  badgeTL: { position: "absolute", left: 8, top: 8, borderRadius: radius.pill, backgroundColor: derived.overlay },
  aspect: { position: "absolute", right: 8, bottom: 8, ...type(11, "regular", { mono: true }), backgroundColor: derived.overlay, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: "hidden" },
});
