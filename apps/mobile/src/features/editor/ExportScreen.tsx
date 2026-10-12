import { ApiError, EDITOR_EXPORT_CREDITS, EXPORT_FPS, exportResolution, type Job } from "@clipiro/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Header, Icon, ProgressBar, useToast, type IconName } from "@/components";
import { editor, jobs } from "@/lib/api";
import { useComposerSeed } from "../social/queries";
import { apiErrorMessage } from "@/lib/errors";
import { imageSource } from "@/lib/images";
import { pollMs } from "@/lib/poll";
import { colors, radius, text, type } from "@/theme";
import { assetKeys } from "../assets/queries";
import { useCreateContext } from "../create/queries";
import { GalleryDenied, saveVideoToGallery, shareVideo } from "../projects/clipFiles";
import { clock, durationOf, useEditor } from "./store";

type Dest = "device" | "assets" | "post";
const DESTS: { id: Dest; label: string; icon: IconName }[] = [
  { id: "device", label: "Device", icon: "download" },
  { id: "assets", label: "Assets", icon: "folder" },
  { id: "post", label: "Post", icon: "send" },
];

/** ~3.5 Mbit/s H.264 at 1080p30 (the web's render settings), less at 720p. */
const estimateMB = (sec: number, free: boolean) => Math.max(1, Math.round((sec * (free ? 1.8 : 3.5)) / 8));

/** An export's job id: the server tracks it by its project (lib/mobile/jobs.ts). */
const exportJobId = (projectId: string) => `exp_${projectId}`;

type Run = { stage: "saving" } | { stage: "rendering"; progress: number } | { stage: "done"; url: string } | { stage: "failed"; message: string };

// design/screens/BN-EdExport.html. The web renders one output: the aspect's
// 1080 frame at 30 fps (Free: 720p + watermark), so there's nothing to pick —
// the design's 720p/4K and 24/60 fps choices aren't offered (decision 2026-10-02).
// The server renders the saved edit (POST /jobs { type: "export" }); the
// phone saves first, then follows the render. Leaving is fine: the server
// sends a push when it's done, which opens this screen again
// (/editor/export?projectId=).
export function ExportScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const { projectId: fromLink } = useLocalSearchParams<{ projectId?: string }>();
  const storeId = useEditor((s) => s.projectId);
  const loading = useEditor((s) => s.loading);
  const doc = useEditor((s) => s.doc);
  const title = useEditor((s) => s.title);
  const media = useEditor((s) => s.media);
  const ctx = useCreateContext();
  const free = ctx.data?.plan === "free";
  const [dest, setDest] = useState<Dest>("device");
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Dest | null>(null);
  // The Assets copy of this export, once made: posting needs one, and a second
  // "Post" shouldn't make another.
  const [assetId, setAssetId] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const projectId = fromLink ?? storeId;
  const ready = !!projectId && storeId === projectId && !loading;

  const duration = durationOf(doc);
  const first = doc.tracks.video[0];
  const cover = first ? (media[first.assetId]?.thumbnailUrl ?? null) : null;

  // Opened from a notification: load that edit.
  useEffect(() => {
    if (fromLink && useEditor.getState().projectId !== fromLink) void useEditor.getState().open(fromLink);
  }, [fromLink]);

  const follow = async (id: string) => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    try {
      const job = await jobs.waitFor(exportJobId(id), { intervalMs: pollMs.export, signal: ac.signal, onProgress: (j) => j.status !== "done" && j.status !== "failed" && setRun({ stage: "rendering", progress: j.progress }) });
      setRun(outcome(job));
    } catch (e) {
      if (ac.signal.aborted) return; // the screen closed; the render carries on
      setRun({ stage: "failed", message: apiErrorMessage(e) });
    }
  };

  // A render already running for this edit (or, from a notification, one
  // that just finished) shows here instead of a fresh Export button.
  useEffect(() => {
    if (!ready || !projectId) return;
    let live = true;
    jobs
      .get(exportJobId(projectId))
      .then((job) => {
        if (!live) return;
        if (job.status === "running") void follow(projectId);
        else if (fromLink && (job.status === "done" || job.status === "failed")) setRun(outcome(job));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opened edit
  }, [ready, projectId]);
  useEffect(() => () => abort.current?.abort(), []);

  const exportVideo = async () => {
    if (!projectId) return;
    setSaved(null);
    setAssetId(null);
    setRun({ stage: "saving" });
    // The server renders what's saved, so the latest changes go up first.
    if (!(await useEditor.getState().flush())) {
      const s = useEditor.getState();
      return setRun({ stage: "failed", message: s.save === "offline" ? "You’re offline. Your latest changes need to save before exporting." : (s.saveError ?? "Couldn’t save your latest changes.") });
    }
    try {
      await jobs.start({ type: "export", projectId });
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "already_rendering")) {
        if (e instanceof ApiError && e.code === "insufficient_credits") toast(e.message, "error");
        return setRun({ stage: "failed", message: apiErrorMessage(e) });
      }
    }
    setRun({ stage: "rendering", progress: 0 });
    await follow(projectId);
  };

  const finish = async () => {
    if (run?.stage !== "done" || !projectId) return;
    setBusy(true);
    try {
      if (dest === "post") {
        // A post is of a video in Assets (docs/mobile/SCHEDULING.md D2), so the export is saved there first.
        const id = assetId ?? (await editor.saveExport(projectId)).id;
        setAssetId(id);
        void qc.invalidateQueries({ queryKey: assetKeys.all });
        useComposerSeed.getState().seed({ assetId: id });
        return router.push("/composer");
      }
      if (dest === "device") {
        await saveVideoToGallery(run.url, `export-${projectId}.mp4`);
        toast("Saved to your gallery.", "success");
      } else {
        setAssetId((await editor.saveExport(projectId)).id);
        void qc.invalidateQueries({ queryKey: assetKeys.all });
        toast("Saved to Assets.", "success");
      }
      setSaved(dest);
    } catch (e) {
      toast(e instanceof GalleryDenied ? e.message : apiErrorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (run?.stage !== "done" || !projectId) return;
    setBusy(true);
    try {
      await shareVideo(run.url, `${title.replace(/[^\w\- ]+/g, "").trim() || "video"}.mp4`, title);
    } catch (e) {
      toast(apiErrorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <View style={[styles.root, styles.center]} accessibilityLabel="Loading the edit">
        <ActivityIndicator color={colors.emeraldBright} />
      </View>
    );
  }

  const done = run?.stage === "done";
  const working = run?.stage === "saving" || run?.stage === "rendering";
  const label = done ? (dest === "post" ? "Continue to post" : dest === "device" ? "Save to gallery" : "Save to Assets") : working ? "Exporting…" : run?.stage === "failed" ? "Try again" : "Export video";

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
        <Header title="Export" onBack={() => router.back()} />

        <View style={styles.summary}>
          <View style={styles.thumb}>
            {cover ? <Image source={imageSource(cover)} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            <Text style={styles.thumbTime}>{clock(duration, false)}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={type(16, "bold")} numberOfLines={2}>
              {title}
            </Text>
            <Text style={type(12, "regular", { color: colors.fgMuted })}>
              {doc.aspect} · {clock(duration, false)}
              {doc.tracks.caption.length ? " · captions on" : ""}
            </Text>
            <Text style={type(12, "medium", { color: free ? colors.warning : colors.emeraldBright })}>
              {free ? "Free plan: 720p with a Clipiro watermark" : "No watermark on your plan"}
            </Text>
          </View>
        </View>

        <View style={styles.outputs} accessible accessibilityLabel={`Output ${exportResolution(doc.aspect, free)}, ${EXPORT_FPS} frames per second`}>
          <Spec label="Resolution" value={exportResolution(doc.aspect, free)} />
          <View style={styles.divider} />
          <Spec label="Frame rate" value={`${EXPORT_FPS} fps`} />
        </View>
        {free ? (
          <Pressable onPress={() => router.push("/you/subscription")} accessibilityRole="link" style={styles.upgrade}>
            <Text style={type(13, "medium", { color: colors.emeraldBright })}>Upgrade for 1080p without a watermark →</Text>
          </Pressable>
        ) : null}

        <View style={{ gap: 10 }}>
          <Text style={text.label}>Save to</Text>
          <View style={styles.dests} accessibilityRole="radiogroup" accessibilityLabel="Save to">
            {DESTS.map((d) => {
              const on = d.id === dest;
              return (
                <Pressable key={d.id} onPress={() => setDest(d.id)} accessibilityRole="radio" aria-checked={on} accessibilityLabel={d.id === "post" ? "Post to social" : d.label} style={[styles.dest, on && styles.destOn]}>
                  <Icon name={saved === d.id ? "check" : d.icon} size={20} color={on ? colors.emeraldBright : colors.fgMuted} />
                  <Text style={type(12, on ? "semibold" : "medium", { color: on ? colors.fg : colors.fgMuted })}>{d.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.row}>
          <Text style={[type(13, "regular", { color: colors.fgMuted }), { flex: 1 }]}>Estimated size</Text>
          <Text style={type(13, "semibold")}>~{estimateMB(duration, free)} MB</Text>
        </View>

        {run ? <RunCard run={run} onShare={() => void share()} busy={busy} /> : null}
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
        <View>
          <Text style={type(11, "regular", { color: colors.fgSubtle })}>Cost</Text>
          <Text style={type(14, "bold")}>
            {EDITOR_EXPORT_CREDITS} credit
          </Text>
        </View>
        <Button label={label} loading={busy} onPress={() => void (done ? finish() : exportVideo())} disabled={working || busy || duration === 0} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

function outcome(job: Job): Run {
  if (job.status === "done" && job.result?.url) return { stage: "done", url: job.result.url };
  return { stage: "failed", message: job.error ?? "The export didn’t finish. Your credit was refunded." };
}

function RunCard({ run, onShare, busy }: { run: Run; onShare: () => void; busy: boolean }) {
  if (run.stage === "failed") {
    return (
      <View style={[styles.render, styles.renderFailed]} accessibilityLiveRegion="polite">
        <Text style={type(14, "semibold")}>The export didn’t finish</Text>
        <Text style={type(12, "regular", { color: colors.fgMuted })}>{run.message}</Text>
      </View>
    );
  }
  const progress = run.stage === "done" ? 100 : run.stage === "rendering" ? run.progress : 0;
  return (
    <View style={styles.render} accessibilityLiveRegion="polite">
      <View style={styles.renderHead}>
        <Text style={[type(14, "semibold"), { flex: 1 }]}>{run.stage === "done" ? "Your video is ready" : run.stage === "saving" ? "Saving your edit…" : "Rendering…"}</Text>
        <Text style={type(13, "semibold", { color: colors.emeraldBright })}>{progress}%</Text>
      </View>
      <ProgressBar value={progress} label="Render progress" />
      <Text style={type(12, "regular", { color: colors.fgMuted })}>
        {run.stage === "done" ? "Rendered on our servers. Save it, share it or post it." : "Rendering on our servers. You can leave this screen — we’ll notify you when it’s ready."}
      </Text>
      {run.stage === "done" ? <Button label="Share" icon="social" iconPosition="start" variant="secondary" size="md" loading={busy} onPress={onShare} /> : null}
    </View>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={text.label}>{label}</Text>
      <Text style={type(16, "semibold")}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 16, paddingBottom: 140, gap: 16 },
  summary: { flexDirection: "row", gap: 14, padding: 14, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, alignItems: "center" },
  thumb: { width: 64, height: 112, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surface3 },
  thumbTime: { position: "absolute", right: 4, bottom: 4, ...type(10, "regular", { mono: true }), textShadowColor: colors.bg, textShadowRadius: 4 },
  outputs: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: radius.tile, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.line },
  divider: { width: 1, alignSelf: "stretch", backgroundColor: colors.line },
  upgrade: { minHeight: 44, justifyContent: "center" },
  dests: { flexDirection: "row", gap: 10 },
  dest: { flex: 1, minHeight: 72, gap: 6, borderRadius: radius.tile, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center" },
  destOn: { backgroundColor: colors.tint, borderColor: colors.emeraldBright },
  row: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: radius.tile, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.line },
  render: { gap: 10, padding: 14, borderRadius: radius.tile, backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.tintBorder },
  renderFailed: { backgroundColor: colors.surface1, borderColor: colors.error },
  renderHead: { flexDirection: "row", alignItems: "center" },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.bgDeep,
    borderTopWidth: 1,
    borderTopColor: colors.lineStrong,
  },
});
