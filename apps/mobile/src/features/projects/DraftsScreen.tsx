import { draftProgress, sortProjects } from "@clipiro/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, ConfirmSheet, EmptyState, Header, Icon, IconButton, ProgressBar, SkeletonCard, StatusBarScrim, useToast } from "@/components";
import { imageSource } from "@/lib/images";
import { useScreenPadding } from "@/navigation/insets";
import { colors, radius, statusTint, text, type } from "@/theme";
import { errorMessage } from "@mocks/core";
import { deleteProjects } from "@mocks/projects";
import { whenEdited } from "./format";
import { ProjectChips } from "./ProjectChips";
import { projectKeys, useProjects } from "./queries";

// design/screens/BN-Drafts.html. Progress is the editing checklist (media,
// trim, captions, audio, text; 20% each) — computed server-side from Phase 5.
export function DraftsScreen() {
  const pad = useScreenPadding();
  const toast = useToast();
  const qc = useQueryClient();
  const projects = useProjects();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const drafts = sortProjects((projects.data ?? []).filter((p) => p.status === "draft"), "recent");

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const remove = async () => {
    setBusy(true);
    try {
      await deleteProjects(picked);
      await qc.invalidateQueries({ queryKey: projectKeys.all });
      toast(`${picked.length} draft${picked.length === 1 ? "" : "s"} deleted.`, "success");
      setPicked([]);
      setSelecting(false);
      setConfirm(false);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, pad]}>
        <Header title="Projects" large actions={<IconButton icon="search" accessibilityLabel="Search projects" onPress={() => router.dismissTo("/projects")} />} />
        <ProjectChips value="drafts" />
        <View style={styles.note}>
          <Icon name="clock" size={18} color={colors.warning} />
          <Text style={[type(13, "regular", { lineHeight: 1.45 }), { flex: 1 }]}>Drafts save as you edit. Progress counts media, trim, captions, audio and text.</Text>
        </View>

        {projects.isPending ? (
          <>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </>
        ) : projects.isError ? (
          <EmptyState tone="error" title="Couldn’t load your drafts" body={errorMessage(projects.error)} action={{ label: "Try again", onPress: () => projects.refetch() }} />
        ) : drafts.length === 0 ? (
          <EmptyState icon="editor" title="No drafts" body="Anything you start in the editor is saved here until you export it." action={{ label: "Open the editor", onPress: () => router.push("/editor") }} />
        ) : (
          <>
            <View style={styles.head}>
              <Text style={text.label} accessibilityRole="header">
                {drafts.length} drafts
              </Text>
              <Pressable
                onPress={() => {
                  setSelecting((s) => !s);
                  setPicked([]);
                }}
                accessibilityRole="button"
                style={styles.link}
              >
                <Text style={type(13, "medium", { color: colors.emeraldBright })}>{selecting ? "Cancel" : "Select"}</Text>
              </Pressable>
            </View>
            {drafts.map((d) => {
              const pct = draftProgress(d.draftSteps ?? []);
              const on = picked.includes(d.id);
              return (
                <Pressable
                  key={d.id}
                  onPress={() => (selecting ? toggle(d.id) : router.push("/editor"))}
                  accessibilityRole={selecting ? "checkbox" : "button"}
                  aria-checked={selecting ? on : undefined}
                  accessibilityLabel={`${d.title}, ${pct}% done, edited ${whenEdited(d.updatedAt)}`}
                  style={[styles.row, on && styles.rowOn]}
                >
                  <View style={styles.thumb}>
                    <Image source={imageSource(d.thumbnailUrl)} style={StyleSheet.absoluteFill} contentFit="cover" />
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={type(15, "semibold")} numberOfLines={2}>
                      {d.title}
                    </Text>
                    <Text style={type(12, "regular", { color: colors.fgMuted })}>
                      {d.kind === "autoclip" ? "AutoClip clip" : "Editor"} · edited {whenEdited(d.updatedAt)}
                    </Text>
                    <View style={styles.progressRow}>
                      <View style={{ flex: 1 }}>
                        <ProgressBar value={pct} height={4} color={colors.warning} label={`${pct}% done`} />
                      </View>
                      <Text style={type(11, "regular", { mono: true, color: colors.fgMuted })}>{pct}%</Text>
                    </View>
                  </View>
                  {selecting ? (
                    <View style={[styles.checkbox, on && styles.checkboxOn]}>{on ? <Icon name="check" size={14} color={colors.bg} strokeWidth={2.6} /> : null}</View>
                  ) : (
                    <Button label="Resume" variant="secondary" size="md" onPress={() => router.push("/editor")} />
                  )}
                </Pressable>
              );
            })}
            {selecting ? <Button label={picked.length ? `Delete ${picked.length}` : "Select drafts to delete"} variant="danger" size="sm" fullWidth disabled={!picked.length} onPress={() => setConfirm(true)} /> : null}
          </>
        )}
      </ScrollView>
      <StatusBarScrim />
      <ConfirmSheet
        visible={confirm}
        title={`Delete ${picked.length} draft${picked.length === 1 ? "" : "s"}?`}
        body="Unsaved edits in these drafts will be lost. This can't be undone."
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
  note: { flexDirection: "row", gap: 10, padding: 14, borderRadius: radius.tile, backgroundColor: statusTint(colors.warning), borderWidth: 1, borderColor: statusTint(colors.warning) },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  link: { minHeight: 44, justifyContent: "center", paddingLeft: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 12, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  rowOn: { borderColor: colors.emeraldBright, backgroundColor: colors.tint },
  thumb: { width: 56, height: 80, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surface3 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: colors.emeraldBright, borderColor: colors.emeraldBright },
});
