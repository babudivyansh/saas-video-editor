import { EDITOR_EXPORT_CREDITS, EXPORT_FPS, exportResolution } from "@clipiro/shared";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Header, Icon, ProgressBar, useToast, type IconName } from "@/components";
import { sample } from "@/lib/images";
import { colors, radius, text, type } from "@/theme";
import { errorMessage } from "@mocks/core";
import { startExport } from "@mocks/editor";
import { useCreateContext } from "../create/queries";
import { clock, durationOf, useEditor } from "./store";

type Dest = "device" | "assets" | "post";
const DESTS: { id: Dest; label: string; icon: IconName }[] = [
  { id: "device", label: "Device", icon: "download" },
  { id: "assets", label: "Assets", icon: "folder" },
  { id: "post", label: "Post", icon: "send" },
];

/** ~3.5 Mbit/s H.264 at 1080p30 (the web's render settings), less at 720p. */
const estimateMB = (sec: number, free: boolean) => Math.max(1, Math.round((sec * (free ? 1.8 : 3.5)) / 8));

// design/screens/BN-EdExport.html. The web renders one output: the aspect's
// 1080 frame at 30 fps (Free: 720p + watermark), so there's nothing to pick —
// the design's 720p/4K and 24/60 fps choices aren't offered (decision 2026-10-02).
export function ExportScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const doc = useEditor((s) => s.doc);
  const ctx = useCreateContext();
  const free = ctx.data?.plan === "free";
  const [dest, setDest] = useState<Dest>("device");
  const [progress, setProgress] = useState<number | null>(null);
  const duration = durationOf(doc);

  // Mock render progress until Phase 9 polls the real job.
  useEffect(() => {
    if (progress == null || progress >= 100) return;
    const t = setTimeout(() => setProgress((p) => Math.min(100, (p ?? 0) + 9)), 400);
    return () => clearTimeout(t);
  }, [progress]);

  const exportVideo = async () => {
    try {
      await startExport();
      setProgress(0);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const done = progress != null && progress >= 100;
  const finish = () => {
    if (dest === "post") return router.replace("/composer");
    toast(dest === "device" ? "Saved to your gallery." : "Saved to Assets.", "success");
    router.back();
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
        <Header title="Export" onBack={() => router.back()} />

        <View style={styles.summary}>
          <View style={styles.thumb}>
            <Image source={sample(doc.segments[0]?.photo ?? "creator-smile")} style={StyleSheet.absoluteFill} contentFit="cover" />
            <Text style={styles.thumbTime}>{clock(duration, false)}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={type(16, "bold")} numberOfLines={2}>
              Nobody tells you this part
            </Text>
            <Text style={type(12, "regular", { color: colors.fgMuted })}>
              {doc.aspect} · {clock(duration, false)} · captions on
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
                <Pressable key={d.id} onPress={() => setDest(d.id)} accessibilityRole="radio" aria-checked={on} accessibilityLabel={d.id === "post" ? "Post to YouTube Shorts" : d.label} style={[styles.dest, on && styles.destOn]}>
                  <Icon name={d.icon} size={20} color={on ? colors.emeraldBright : colors.fgMuted} />
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

        {progress != null ? (
          <View style={styles.render} accessibilityLiveRegion="polite">
            <View style={styles.renderHead}>
              <Text style={[type(14, "semibold"), { flex: 1 }]}>{done ? "Your video is ready" : "Rendering…"}</Text>
              <Text style={type(13, "semibold", { color: colors.emeraldBright })}>{progress}%</Text>
            </View>
            <ProgressBar value={progress} label="Render progress" />
            <Text style={type(12, "regular", { color: colors.fgMuted })}>
              {done ? "Rendered on our servers. It's also in your project." : "Rendering on our servers. Keep the app open or we'll notify you."}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
        <View>
          <Text style={type(11, "regular", { color: colors.fgSubtle })}>Cost</Text>
          <Text style={type(14, "bold")}>
            {EDITOR_EXPORT_CREDITS} credit
          </Text>
        </View>
        <Button
          label={done ? (dest === "post" ? "Continue to post" : "Save") : progress != null ? "Rendering…" : "Export video"}
          onPress={done ? finish : exportVideo}
          disabled={progress != null && !done}
          style={{ flex: 1 }}
        />
      </View>
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
