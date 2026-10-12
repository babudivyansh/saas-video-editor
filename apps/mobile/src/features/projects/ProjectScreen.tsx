import { SCORE_BUCKETS, scoreSpread, type Clip, type ProjectDetail } from "@clipiro/shared";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Button, EmptyState, FilterPills, Header, Icon, IconButton, ScoreBadge, ScoreRing, SkeletonCard, StatusBadge, StatusBarScrim, useToast } from "@/components";
import { imageSource } from "@/lib/images";
import { useScreenPadding } from "@/navigation/insets";
import { colors, derived, radius, text, type } from "@/theme";
import { ApiError, errorMessage } from "@mocks/core";
import { ClipSheet } from "./ClipSheet";
import { mmss } from "./format";
import { useProject } from "./queries";

type Filter = "all" | "ready" | "rendering" | "starred";
const FILTERS = [
  { value: "all", label: "All" },
  { value: "ready", label: "Ready" },
  { value: "rendering", label: "Rendering" },
  { value: "starred", label: "Starred" },
] as const;

const keep = (c: Clip, f: Filter) => f === "all" || (f === "ready" ? c.status === "ready" : f === "rendering" ? c.status === "rendering" || c.status === "queued" : c.favorite);

// design/screens/BN-Insights.html — one AutoClip project and its clips.
export function ProjectScreen() {
  const pad = useScreenPadding();
  const toast = useToast();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const project = useProject(projectId ?? "");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/projects"));
  const p = project.data;
  const clips = p?.clips ?? [];
  const open = clips.find((c) => c.id === openId) ?? null;
  const ready = clips.filter((c) => c.status === "ready");
  const top = [...ready].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const created = p ? new Date(p.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, pad]}>
        <Header title={p?.title ?? "Project"} subtitle={p ? `${p.kind === "autoclip" ? "AutoClip" : "Editor"} project · ${created}` : undefined} onBack={back} />
        {project.isPending ? (
          <>
            <SkeletonCard lines={4} />
            <SkeletonCard lines={2} />
          </>
        ) : project.isError ? (
          project.error instanceof ApiError && project.error.status === 404 ? (
            <EmptyState icon="folder" title="Project not found" body="It may have been deleted." action={{ label: "Back to Projects", onPress: () => router.replace("/projects") }} />
          ) : (
            <EmptyState tone="error" title="Couldn’t load this project" body={errorMessage(project.error)} action={{ label: "Try again", onPress: () => project.refetch() }} />
          )
        ) : clips.length === 0 ? (
          <EmptyState icon="clock" title={p?.status === "failed" ? "This run didn't finish" : "Clips on the way"} body={p?.status === "failed" ? "Your Clip Minutes were refunded. Try the video again." : "We'll notify you when they're ready."} />
        ) : (
          <>
            <View style={styles.row}>
              {top ? <TopClip clip={top} onPress={() => setOpenId(top.id)} /> : null}
              <View style={styles.col}>
                <Stats p={p!} />
                <Spread clips={clips} />
              </View>
            </View>
            <View style={styles.actions}>
              <Button
                label="Download all ready"
                onPress={() => toast(`Saving ${ready.length} clips to your gallery.`, "success")}
                disabled={!ready.length}
                style={{ flex: 1 }}
              />
              <IconButton icon="social" accessibilityLabel="Share project" size={54} onPress={() => Share.share({ message: `${p?.title} — made with Clipiro` }).catch(() => {})} />
            </View>
            <FilterPills accessibilityLabel="Show clips" options={FILTERS} value={filter} onChange={setFilter} />
            <ClipGrid clips={clips.filter((c) => keep(c, filter))} onOpen={(c) => setOpenId(c.id)} empty={filter === "starred" ? "Star clips to find them here." : "Nothing here right now."} />
          </>
        )}
      </ScrollView>
      <StatusBarScrim />
      <ClipSheet clip={open} onClose={() => setOpenId(null)} />
    </View>
  );
}

function TopClip({ clip, onPress }: { clip: Clip; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Top clip: ${clip.title}, score ${clip.score}, ${mmss(clip.durationSec)}`} style={styles.hero}>
      <Image source={imageSource(clip.thumbnailUrl)} style={StyleSheet.absoluteFill} contentFit="cover" />
      <Svg style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="top" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.3" stopColor={colors.bg} stopOpacity={0.2} />
            <Stop offset="1" stopColor={colors.bg} stopOpacity={0.92} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#top)" />
      </Svg>
      <View style={styles.heroTop}>
        <View style={styles.onPhoto}>
          <StatusBadge label="Ready" tone="success" />
        </View>
        <Text style={type(11, "regular", { mono: true })}>#{clip.rank}</Text>
      </View>
      <View style={styles.heroBottom}>
        <ScoreRing value={clip.score ?? 0} max={99} size={50} label={`Virality score ${clip.score}`} />
        <Text style={type(14, "bold", { lineHeight: 1.25 })} numberOfLines={3}>
          {clip.title}
        </Text>
        <Text style={type(11, "regular", { mono: true, color: colors.fgMuted })}>
          {mmss(clip.durationSec)} · {clip.aspect}
        </Text>
      </View>
    </Pressable>
  );
}

function Stats({ p }: { p: ProjectDetail }) {
  const n = (s: Clip["status"]) => p.clips.filter((c) => c.status === s).length;
  const parts = [`${n("ready")} ready`, n("rendering") + n("queued") ? `${n("rendering") + n("queued")} rendering` : null, n("failed") ? `${n("failed")} failed` : null].filter(Boolean);
  return (
    <View style={styles.card}>
      <Text style={text.label}>Clips</Text>
      <Text style={type(30, "heavy")}>{p.clips.length}</Text>
      <Text style={type(11, "regular", { color: colors.fgMuted })}>{parts.join(" · ")}</Text>
    </View>
  );
}

function Spread({ clips }: { clips: Clip[] }) {
  const counts = scoreSpread(clips);
  const max = Math.max(1, ...counts);
  return (
    <View style={styles.card} accessible accessibilityLabel={`Score spread: ${SCORE_BUCKETS.map((b, i) => `${b.label} ${counts[i]}`).join(", ")}`}>
      <Text style={text.label}>Score spread</Text>
      <View style={styles.bars}>
        {SCORE_BUCKETS.map((b, i) => (
          <View key={b.label} style={styles.barCol}>
            <View style={[styles.bar, { height: Math.max(4, (70 * (counts[i] ?? 0)) / max), backgroundColor: i < 2 ? colors.emeraldBright : colors.surface3 }]} />
            <Text style={type(11, "regular", { color: colors.fgSubtle })} maxFontSizeMultiplier={1.2}>
              {b.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function ClipGrid({ clips, onOpen, empty }: { clips: Clip[]; onOpen: (c: Clip) => void; empty: string }) {
  // Pixel sizes: a % width + aspectRatio gives the tiles no height on Android.
  const tileW = Math.floor((useWindowDimensions().width - 32 - 16) / 3);
  if (!clips.length) return <Text style={[text.caption, { paddingVertical: 16 }]}>{empty}</Text>;
  return (
    <View style={styles.grid}>
      {clips.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => onOpen(c)}
          accessibilityRole="button"
          accessibilityLabel={`${c.title}${c.score != null ? `, score ${c.score}` : ""}, ${c.status}${c.favorite ? ", starred" : ""}`}
          style={[styles.tile, { width: tileW, height: Math.round((tileW * 14) / 9) }]}
        >
          <Image source={imageSource(c.thumbnailUrl)} style={StyleSheet.absoluteFill} contentFit="cover" />
          <Svg style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]} width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id={`g-${c.id}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0.5" stopColor={colors.bg} stopOpacity={0} />
                <Stop offset="1" stopColor={colors.bg} stopOpacity={0.85} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#g-${c.id})`} />
          </Svg>
          <View style={styles.tileTop}>
            {c.score != null ? <ScoreBadge score={c.score} compact /> : <View />}
            {c.status === "rendering" || c.status === "queued" ? <View style={styles.onPhoto}><StatusBadge label="Rendering" tone="info" /></View> : c.status === "failed" ? <View style={styles.onPhoto}><StatusBadge label="Failed" tone="error" /></View> : c.favorite ? <Icon name="star" size={16} color={colors.warning} filled /> : null}
          </View>
          <Text style={[styles.tileTitle, type(12, "semibold", { lineHeight: 1.25 })]} numberOfLines={2}>
            {c.title}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 12 },
  row: { flexDirection: "row", gap: 10 },
  col: { flex: 1, gap: 10 },
  hero: { flex: 1, minHeight: 300, borderRadius: radius.card, overflow: "hidden", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface3 },
  heroTop: { position: "absolute", left: 14, right: 14, top: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroBottom: { position: "absolute", left: 14, right: 14, bottom: 14, gap: 6 },
  card: { padding: 14, gap: 10, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  bars: { height: 92, flexDirection: "row", alignItems: "flex-end", gap: 5 },
  barCol: { flex: 1, alignItems: "center", gap: 6 },
  bar: { width: "100%", borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  actions: { flexDirection: "row", gap: 10, alignItems: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { borderRadius: radius.tile, overflow: "hidden", backgroundColor: colors.surface3 },
  onPhoto: { borderRadius: radius.pill, backgroundColor: derived.overlay },
  tileTop: { position: "absolute", left: 6, right: 6, top: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tileTitle: { position: "absolute", left: 8, right: 8, bottom: 8 },
});
