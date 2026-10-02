import type { Clip } from "@clipiro/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BottomSheet, Button, ConfirmSheet, useToast } from "@/components";
import { imageSource } from "@/lib/images";
import { colors, radius, statusTint, type } from "@/theme";
import { errorMessage } from "@mocks/core";
import { deleteClips, retryClip, setClipFavorite } from "@mocks/projects";
import { mmss } from "./format";
import { projectKeys } from "./queries";

// What you can do with one clip (decision 2026-10-02 A: the design has no clip
// screen, so tapping a clip opens this). Downloading to the gallery and posting
// become real in Phases 7 and 11.
export function ClipSheet({ clip, onClose }: { clip: Clip | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = clip?.status === "ready";

  const run = async (fn: () => Promise<void>, done: string, close = true) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: projectKeys.all });
      toast(done, "success");
      if (close) {
        setConfirm(false);
        onClose();
      }
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  if (!clip) return null;
  return (
    <>
      <BottomSheet visible={!confirm} onClose={onClose} title={`#${clip.rank} · ${clip.title}`}>
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
              <Text style={type(12, "regular", { color: colors.info })}>Still rendering. Download and posting unlock when it’s ready.</Text>
            ) : null}
          </View>
        </View>
        {clip.status === "failed" ? (
          <View style={styles.failed}>
            <Text style={type(13, "regular", { color: colors.fg, lineHeight: 1.4 })}>{clip.failureReason ?? "This clip didn't render."}</Text>
            <Button label="Retry render" icon="refresh" iconPosition="start" variant="secondary" size="sm" loading={busy} onPress={() => run(() => retryClip(clip.id), "Rendering again.")} />
          </View>
        ) : null}
        <View style={styles.grid}>
          <Button label="Edit" icon="editor" iconPosition="start" variant="secondary" size="md" style={styles.cell} onPress={() => (onClose(), router.push("/editor"))} />
          <Button
            label={clip.favorite ? "Starred" : "Star"}
            icon="star"
            iconPosition="start"
            variant="secondary"
            size="md"
            style={styles.cell}
            onPress={() => run(() => setClipFavorite(clip.id, !clip.favorite), clip.favorite ? "Removed from starred." : "Starred.", false)}
          />
          <Button label="Download" icon="download" iconPosition="start" variant="secondary" size="md" style={styles.cell} disabled={!ready} onPress={() => (toast("Saving to your gallery.", "success"), onClose())} />
          <Button label="Post" icon="send" iconPosition="start" variant="secondary" size="md" style={styles.cell} disabled={!ready} onPress={() => (onClose(), router.push("/composer"))} />
        </View>
        <Button label="Delete clip" icon="trash" iconPosition="start" variant="danger" size="sm" fullWidth onPress={() => setConfirm(true)} />
      </BottomSheet>
      <ConfirmSheet
        visible={confirm}
        title="Delete this clip?"
        body={`“${clip.title}” will be deleted from the project. This can't be undone.`}
        confirmLabel="Delete clip"
        busy={busy}
        onClose={() => setConfirm(false)}
        onConfirm={() => run(() => deleteClips([clip.id]), "Clip deleted.")}
      />
    </>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", gap: 12, alignItems: "center" },
  thumb: { width: 56, height: 96, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surface3 },
  failed: { gap: 10, padding: 12, borderRadius: radius.tile, backgroundColor: statusTint(colors.error) },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cell: { width: "48%", flexGrow: 1 },
});
