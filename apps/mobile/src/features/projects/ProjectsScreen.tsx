import { PROJECT_SORTS, draftProgress, sortProjects, type ProjectSort, type ProjectSummary } from "@clipiro/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
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
import { imageSource } from "@/lib/images";
import { useScreenPadding } from "@/navigation/insets";
import { colors, derived, radius, text, type } from "@/theme";
import { errorMessage } from "@mocks/core";
import { deleteProjects, renameProject } from "@mocks/projects";
import { mmss, whenEdited } from "./format";
import { ProjectChips } from "./ProjectChips";
import { projectKeys, useProjects } from "./queries";

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

// design/screens/BN-Projects.html — the Projects tab root.
export function ProjectsScreen() {
  const pad = useScreenPadding();
  const toast = useToast();
  const qc = useQueryClient();
  const projects = useProjects();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ProjectSort>("recent");
  const [sheet, setSheet] = useState<"sort" | "actions" | "rename" | "delete" | null>(null);
  const [target, setTarget] = useState<ProjectSummary | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const q = query.trim().toLowerCase();
  const list = sortProjects((projects.data ?? []).filter((p) => !q || p.title.toLowerCase().includes(q)), sort);
  const draft = sortProjects((projects.data ?? []).filter((p) => p.status === "draft"), "recent")[0];

  const refresh = async () => {
    setRefreshing(true);
    await projects.refetch();
    setRefreshing(false);
  };
  const act = (p: ProjectSummary) => {
    setTarget(p);
    setNewTitle(p.title);
    setSheet("actions");
  };
  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: projectKeys.all });
      toast(done, "success");
      setSheet(null);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, pad]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.emeraldBright} colors={[colors.emeraldBright]} progressBackgroundColor={colors.surface2} />}
      >
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

        {projects.isPending ? (
          <>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={2} />
          </>
        ) : projects.isError ? (
          <EmptyState tone="error" title="Couldn’t load your projects" body={errorMessage(projects.error)} action={{ label: "Try again", onPress: () => projects.refetch() }} />
        ) : projects.data.length === 0 ? (
          <EmptyState icon="projects" title="No projects yet" body="Turn a long video into clips, or start a fresh edit." action={{ label: "Start with AutoClip", onPress: () => router.push("/create/autoclip") }} />
        ) : (
          <>
            {draft && !q ? (
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

            <View style={styles.listHead}>
              <Text style={text.label} accessibilityRole="header">
                {q ? `Results · ${list.length}` : `All projects · ${list.length}`}
              </Text>
              <Pressable onPress={() => setSheet("sort")} accessibilityRole="button" accessibilityLabel={`Sort: ${PROJECT_SORTS.find((s) => s.id === sort)?.label}`} style={styles.sortBtn}>
                <Text style={type(12, "regular", { color: colors.fgMuted })}>{PROJECT_SORTS.find((s) => s.id === sort)?.label}</Text>
                <Icon name="chevronDown" size={14} color={colors.fgMuted} />
              </Pressable>
            </View>

            {list.length === 0 ? (
              <EmptyState icon="search" title={`No projects match “${query.trim()}”`} body="Try another name." />
            ) : (
              <View style={styles.grid}>
                {list.map((p) => (
                  <ProjectCard key={p.id} p={p} onLongPress={() => act(p)} />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
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
        <TextField label="Name" value={newTitle} onChangeText={setNewTitle} autoFocus maxLength={120} returnKeyType="done" />
        <Button label="Save" variant="secondary" size="sm" fullWidth loading={busy} onPress={() => target && run(() => renameProject(target.id, newTitle), "Project renamed.")} />
      </BottomSheet>
      <ConfirmSheet
        visible={sheet === "delete"}
        title="Delete project?"
        body={`“${target?.title}” and its clips will be deleted. This can't be undone.`}
        confirmLabel="Delete project"
        busy={busy}
        onClose={() => setSheet(null)}
        onConfirm={() => target && run(() => deleteProjects([target.id]), "Project deleted.")}
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
  content: { paddingHorizontal: 16, gap: 14 },
  resume: { flexDirection: "row", alignItems: "center", gap: 14, padding: 12, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.tintBorder },
  resumeThumb: { width: 70, height: 110, borderRadius: 14, overflow: "hidden", backgroundColor: colors.surface3 },
  listHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sortBtn: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingLeft: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", columnGap: 10, rowGap: 14 },
  card: { width: "48%", flexGrow: 1, maxWidth: "50%", gap: 8 },
  cardThumb: { height: 150, borderRadius: radius.tile, overflow: "hidden", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface3 },
  // Dark backing so the tinted badge stays readable on bright photos.
  badgeTL: { position: "absolute", left: 8, top: 8, borderRadius: radius.pill, backgroundColor: derived.overlay },
  aspect: { position: "absolute", right: 8, bottom: 8, ...type(11, "regular", { mono: true }), backgroundColor: derived.overlay, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: "hidden" },
});
