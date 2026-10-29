import { docDimensions, videoClipAt, type CaptionClip, type TextClip, type TimelineDoc, type VideoClip } from "@clipiro/shared";
import { useVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, type, withAlpha } from "@/theme";
import { durationOf, useEditor } from "./store";

// What the export will look like at the playhead: the video clip under it
// (expo-video, switched at each cut), with captions and text drawn on top at
// their real positions, sizes and times (decision 2026-10-09 A). Filters show
// as a colour wash and effects/transitions only in the export — the phone
// can't run the server's ffmpeg looks live.

const FILTER_WASH: Record<string, string> = {
  warm: withAlpha(colors.warning, 0.16),
  cool: withAlpha(colors.info, 0.16),
  mono: withAlpha(colors.bg, 0.35),
  vivid: withAlpha(colors.emeraldBright, 0.08),
  fade: withAlpha(colors.fg, 0.12),
  noir: withAlpha(colors.bg, 0.5),
  sunset: withAlpha(colors.error, 0.16),
  tealOrange: withAlpha(colors.info, 0.12),
  softGlow: withAlpha(colors.fg, 0.08),
};

/** How far the video may drift from the playhead before it's moved back. */
const DRIFT_S = 0.35;
const TICK_MS = 33;

export function aspectHeight(doc: Pick<TimelineDoc, "aspect" | "size">, width: number) {
  const f = docDimensions(doc);
  return (width * f.h) / f.w;
}

const transform = (s: string, t?: string) => (t === "uppercase" ? s.toUpperCase() : t === "lowercase" ? s.toLowerCase() : t === "capitalize" ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : s);

export function EditorPreview({ width }: { width: number }) {
  const doc = useEditor((s) => s.doc);
  const media = useEditor((s) => s.media);
  const playhead = useEditor((s) => s.playhead);
  const playing = useEditor((s) => s.playing);
  const height = aspectHeight(doc, width);

  const clip = videoClipAt(doc, playhead);
  const uri = clip ? media[clip.assetId]?.url ?? null : null;
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0;
  });
  const loaded = useRef<string | null>(null);

  // The source follows the clip under the playhead.
  useEffect(() => {
    if (uri === loaded.current) return;
    loaded.current = uri;
    if (uri) player.replace({ uri });
    else player.pause();
  }, [uri, player]);

  // Position, speed and volume follow the clip; corrected when it drifts.
  useEffect(() => {
    if (!clip || !uri) return;
    syncPlayer(player, clip, playhead, playing);
  }, [clip, uri, playhead, playing, player]);

  useEffect(() => {
    if (playing && uri) player.play();
    else player.pause();
  }, [playing, uri, player]);

  // The playhead runs on the clock while playing (gaps included) and stops at the end.
  useEffect(() => {
    if (!playing) return;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const { playhead: t, doc: d, seek, setPlaying } = useEditor.getState();
      const next = t + (now - last) / 1000;
      last = now;
      if (next >= durationOf(d)) {
        seek(durationOf(d));
        setPlaying(false);
      } else seek(next);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [playing]);

  const texts = doc.tracks.text.filter((c) => !c.hidden && playhead >= c.timelineStart && playhead < c.timelineStart + c.duration);
  const cue = doc.tracks.caption.find((c) => !c.hidden && playhead >= c.timelineStart && playhead < c.timelineStart + c.duration);
  const wash = clip?.filter ? FILTER_WASH[clip.filter] : undefined;

  return (
    <View
      style={[styles.frame, { width, height }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Preview at ${Math.round(playhead)} of ${Math.round(durationOf(doc))} seconds, ${doc.aspect}${cue ? `, caption: ${cue.text}` : ""}`}
    >
      {uri ? <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} /> : null}
      {wash ? <View style={[StyleSheet.absoluteFill, { backgroundColor: wash }]} /> : null}
      {!clip && doc.tracks.video.length === 0 ? (
        <View style={styles.empty}>
          <Text style={type(12, "regular", { color: colors.fgMuted })}>Add media to start</Text>
        </View>
      ) : null}
      {texts.map((t) => (
        <Overlay key={t.id} clip={t} width={width} height={height} />
      ))}
      {cue ? <Caption cue={cue} at={playhead} width={width} height={height} /> : null}
    </View>
  );
}

/** A text clip at its normalized position and size (% of the frame's height). */
function Overlay({ clip, width, height }: { clip: TextClip; width: number; height: number }) {
  const size = Math.max(6, clip.fontSizePct * height);
  const align = clip.align ?? "center";
  const left = align === "center" ? clip.x * width - width / 2 : align === "left" ? clip.x * width : clip.x * width - width;
  return (
    <View style={[styles.overlay, { top: clip.y * height - size * 0.7, left, width, alignItems: align === "center" ? "center" : align === "left" ? "flex-start" : "flex-end", opacity: clip.opacity ?? 1 }]} pointerEvents="none">
      <Text
        allowFontScaling={false}
        style={[
          type(size, clip.bold ? "bold" : "medium", { color: clip.color }),
          { textAlign: align, lineHeight: size * (clip.lineHeight ?? 1.2), transform: [{ rotate: `${clip.rotationDeg ?? 0}deg` }] },
          clip.bgColor ? { backgroundColor: clip.bgColor, paddingHorizontal: size * 0.3, borderRadius: size * 0.25, overflow: "hidden" } : null,
          clip.strokeColor ? { textShadowColor: clip.strokeColor, textShadowRadius: Math.max(1, (clip.strokeWidthPct ?? 0.004) * height) } : styles.shadow,
        ]}
      >
        {transform(clip.text, clip.textTransform)}
      </Text>
    </View>
  );
}

/** The caption cue under the playhead, its words lit by their own timings. */
function Caption({ cue, at, width, height }: { cue: CaptionClip; at: number; width: number; height: number }) {
  const size = Math.max(6, cue.fontSizePct * height);
  const ms = (at - cue.timelineStart) * 1000 * (cue.highlightSpeed ?? 1);
  const accent = cue.highlightColor ?? colors.emeraldBright;
  const words = cue.words?.length ? cue.words : cue.text.split(/\s+/).map((word) => ({ word, startMs: 0, endMs: 0 }));
  return (
    <View style={[styles.caption, { top: cue.y * height - size * 0.7, width: width * 0.9, left: width * 0.05 }]} pointerEvents="none">
      {words.map((w, i) => {
        const active = cue.highlightMode !== "none" && ms >= w.startMs && ms < w.endMs;
        const said = cue.highlightMode === "karaoke" && ms >= w.startMs;
        const lit = cue.highlightMode === "phrase" || active || said;
        return (
          <Text
            key={i}
            allowFontScaling={false}
            style={[
              type(size, cue.bold ? "heavy" : "semibold", { color: lit ? accent : cue.color }),
              cue.strokeColor ? { textShadowColor: cue.strokeColor, textShadowRadius: Math.max(1, (cue.strokeWidthPct ?? 0.004) * height) } : styles.shadow,
              cue.bgColor ? { backgroundColor: cue.bgColor, paddingHorizontal: 3 } : null,
            ]}
          >
            {transform(w.word, cue.textTransform)}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.tile, overflow: "hidden", borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.bg },
  empty: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  overlay: { position: "absolute" },
  caption: { position: "absolute", flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 5 },
  shadow: { textShadowColor: colors.bg, textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 } },
});

/** Puts the player where the clip says: speed, volume, and position (moved only when it has drifted, while playing). */
function syncPlayer(player: VideoPlayer, clip: VideoClip, playhead: number, playing: boolean) {
  const speed = clip.speed ?? 1;
  const want = clip.srcIn + (playhead - clip.timelineStart) * speed;
  if (player.playbackRate !== speed) player.playbackRate = speed;
  player.volume = clip.muted ? 0 : clip.volume;
  if (!playing || Math.abs(player.currentTime - want) > DRIFT_S) player.currentTime = want;
}
