import type { Clip, ProjectDetail } from "@clipiro/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import { usePhonePrefs } from "@/lib/phonePrefs";
import { useComposerSeed } from "../social/queries";
import { useVideoPlayer, VideoView } from "expo-video";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BottomSheet, Button, ConfirmSheet, useToast } from "@/components";
import { projects } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { imageSource } from "@/lib/images";
import { colors, radius, statusTint, type } from "@/theme";
import { GalleryDenied, saveClipsToGallery, shareClip } from "./clipFiles";
import { startEdit } from "../editor/open";
import { mmss } from "./format";
import { projectKeys, useClip } from "./queries";

/** A failed download/save/share, as a line to show. */
export const fileErrorMessage = (e: unknown) => (e instanceof GalleryDenied ? e.message : apiErrorMessage(e));

// What you can do with one clip (decision 2026-10-02 A: the design has no clip
// screen, so tapping a clip opens this): watch it, star, save to the gallery,
// share the MP4, retry a failed render, delete. Editing and posting arrive in
// Phases 9 and 11.
export function ClipSheet({ clip, onClose }: { clip: Clip | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const detail = useClip(clip?.id ?? null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<"retry" | "delete" | "download" | "share" | null>(null);
  const ready = clip?.status === "ready";

  const projectKey = clip ? projectKeys.detail(clip.projectId) : null;
  const patchClip = (patch: Partial<Clip>) =>
    projectKey && qc.setQueryData<ProjectDetail>(projectKey, (p) => (p ? { ...p, clips: p.clips.map((c) => (c.id === clip!.id ? { ...c, ...patch } : c)) } : p));

  const act = async (which: NonNullable<typeof busy>, fn: () => Promise<unknown>, done?: string, close = false) => {
    setBusy(which);
    try {
      await fn();
      if (done) toast(done, "success");
      if (close) {
        setConfirm(false);
        onClose();
      }
    } catch (e) {
      toast(fileErrorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  // Starring answers at once; it's undone if the server says no.
  const star = async () => {
    if (!clip) return;
    const favorite = !clip.favorite;
    patchClip({ favorite });
    try {
      await projects.updateClip(clip.id, { favorite });
    } catch (e) {
      patchClip({ favorite: !favorite });
      toast(apiErrorMessage(e), "error");
    }
  };

  if (!clip) return null;
  const videoUrl = ready ? (detail.data?.videoUrl ?? null) : null;
  return (
    <>
      <BottomSheet visible={!confirm} onClose={onClose} title={`#${clip.rank} · ${clip.title}`}>
        {videoUrl ? (
          <ClipPreview uri={videoUrl} aspect={clip.aspect} title={clip.title} />
        ) : (
          <View style={styles.head}>
            <View style={styles.thumb}>
              <Image source={imageSource(clip.thumbnailUrl)} style={StyleSheet.absoluteFill} contentFit="cover" />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={type(13, "regular", { color: colors.fgMuted, mono: true })}>
                {mmss(clip.durationSec)} · {clip.aspect}
              </Text>
              {clip.score != null ? <Text style={type(14, "semibold")}>Virality score {clip.score}</Text> : null}
              {clip.status === "rendering" || clip.status === "queued" ? (
                <Text style={type(12, "regular", { color: colors.info })}>Still rendering. Download and sharing unlock when it’s ready.</Text>
              ) : null}
            </View>
          </View>
        )}
        {videoUrl && clip.score != null ? (
          <Text style={type(13, "semibold")}>
            Virality score {clip.score} <Text style={type(13, "regular", { color: colors.fgMuted, mono: true })}>· {mmss(clip.durationSec)} · {clip.aspect}</Text>
          </Text>
        ) : null}
        {detail.data?.reasoning ? (
          <Text style={type(13, "regular", { color: colors.fgMuted, lineHeight: 1.45 })} numberOfLines={3}>
            {detail.data.reasoning}
          </Text>
        ) : null}
        {clip.status === "failed" ? (
          <View style={styles.failed}>
            <Text style={type(13, "regular", { color: colors.fg, lineHeight: 1.4 })}>{clip.failureReason ?? "This clip didn't render."}</Text>
            <Button
              label="Retry render"
              icon="refresh"
              iconPosition="start"
              variant="secondary"
              size="sm"
              loading={busy === "retry"}
              onPress={() =>
                act("retry", async () => {
                  const next = await projects.retryClip(clip.id);
                  patchClip({ status: next.status, failureReason: next.failureReason });
                }, "Rendering again.", true)
              }
            />
          </View>
        ) : null}
        <View style={styles.grid}>
          <Button label={clip.favorite ? "Starred" : "Star"} icon="star" iconPosition="start" variant="secondary" size="md" style={styles.cell} onPress={star} />
          <Button
            label="Download"
            icon="download"
            iconPosition="start"
            variant="secondary"
            size="md"
            style={styles.cell}
            disabled={!ready}
            loading={busy === "download"}
            onPress={() => act("download", () => saveClipsToGallery([clip.id]), "Saved to your gallery.")}
          />
          <Button
            label="Share"
            icon="social"
            iconPosition="start"
            variant="secondary"
            size="md"
            style={styles.cell}
            disabled={!ready}
            loading={busy === "share"}
            onPress={() => act("share", () => shareClip(clip.id, clip.title))}
          />
          <Button label="Post" icon="send" iconPosition="start" variant="secondary" size="md" style={styles.cell} disabled={!ready} onPress={() => (onClose(), useComposerSeed.getState().seed({ clipId: clip.id }), router.push("/composer"))} />
          <Button label="Edit" icon="editor" iconPosition="start" variant="secondary" size="md" style={styles.cell} onPress={() => (onClose(), void startEdit({ from: "clip", clipId: clip.id }).then((err) => err && toast(err, "error")))} disabled={!ready} />
        </View>
        <Button label="Delete clip" icon="trash" iconPosition="start" variant="danger" size="sm" fullWidth onPress={() => setConfirm(true)} />
      </BottomSheet>
      <ConfirmSheet
        visible={confirm}
        title="Delete this clip?"
        body={`“${clip.title}” will be deleted from the project. This can't be undone.`}
        confirmLabel="Delete clip"
        busy={busy === "delete"}
        onClose={() => setConfirm(false)}
        onConfirm={() =>
          act("delete", async () => {
            await projects.removeClip(clip.id);
            if (projectKey) await qc.invalidateQueries({ queryKey: projectKey });
          }, "Clip deleted.", true)
        }
      />
    </>
  );
}

/** The clip itself, looping, with the system controls and fullscreen. */
function ClipPreview({ uri, aspect, title }: { uri: string; aspect: Clip["aspect"]; title: string }) {
  const autoplay = usePhonePrefs((s) => s.autoplay);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    if (autoplay) p.play(); // Settings → Autoplay previews
  });
  const ratio = aspect === "9:16" ? 9 / 16 : aspect === "16:9" ? 16 / 9 : 1;
  return (
    <View style={[styles.preview, { aspectRatio: ratio, maxHeight: 420 }]} accessibilityLabel={`Preview of ${title}`}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls fullscreenOptions={{ enable: true }} />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", gap: 12, alignItems: "center" },
  thumb: { width: 56, height: 96, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surface3 },
  preview: { alignSelf: "center", height: 420, borderRadius: radius.tile, overflow: "hidden", backgroundColor: colors.bg },
  failed: { gap: 10, padding: 12, borderRadius: radius.tile, backgroundColor: statusTint(colors.error) },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cell: { width: "48%", flexGrow: 1 },
});
