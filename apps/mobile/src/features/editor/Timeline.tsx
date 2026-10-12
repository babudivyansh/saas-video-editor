import type { AnyClip, TrackKind } from "@clipiro/shared";
import { Image } from "expo-image";
import { memo, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Icon } from "@/components";
import { imageSource } from "@/lib/images";
import { colors, type, withAlpha } from "@/theme";
import { trimVideo } from "./docOps";
import { clock, durationOf, useEditor } from "./store";

// The timeline: lanes for video, captions, text and audio scrolling under a
// fixed playhead in the middle (scrolling scrubs), pinch to zoom, tap a clip
// to select it, drag the selected video clip's handles to trim it. Clips are
// absolutely placed by time, so a long project costs only what's on screen.

const LANE_H: Record<TrackKind, number> = { video: 52, caption: 24, text: 24, audio: 24, image: 24 };
const LANES: TrackKind[] = ["video", "caption", "text", "image", "audio"];
const MIN_PPS = 8;
const MAX_PPS = 160;

export function Timeline() {
  const { width: screenW } = useWindowDimensions();
  const doc = useEditor((s) => s.doc);
  const media = useEditor((s) => s.media);
  const playhead = useEditor((s) => s.playhead);
  const playing = useEditor((s) => s.playing);
  const selected = useEditor((s) => s.selected);
  const [pps, setPps] = useState(40); // pixels per second
  const [view, setView] = useState(screenW - 32);
  const scroller = useRef<ScrollView>(null);
  const dragging = useRef(false);
  const [pinchBase, setPinchBase] = useState(pps);

  const total = Math.max(durationOf(doc), 0.1);
  const pad = view / 2; // so 0 and the end can both sit under the playhead
  const lanes = LANES.filter((k) => k === "video" || doc.tracks[k].length > 0);

  // Follow the playhead (playing, or moved by another control) unless the user is scrubbing.
  useEffect(() => {
    if (!dragging.current) scroller.current?.scrollTo({ x: playhead * pps, animated: false });
  }, [playhead, pps]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (dragging.current) useEditor.getState().seek(e.nativeEvent.contentOffset.x / pps);
  };

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => {
      setPinchBase(pps);
    })
    .onUpdate((e) => setPps(Math.max(MIN_PPS, Math.min(MAX_PPS, pinchBase * e.scale))));

  return (
    <View style={styles.wrap} onLayout={(e) => setView(e.nativeEvent.layout.width)}>
      <View style={styles.head}>
        <Text style={type(12, "regular", { mono: true, color: colors.fgMuted })}>
          {clock(playhead)} / {clock(total)}
        </Text>
        <View style={styles.zoom}>
          <Pressable onPress={() => setPps((p) => Math.max(MIN_PPS, p / 1.5))} accessibilityRole="button" accessibilityLabel="Zoom out" hitSlop={8}>
            <Icon name="minus" size={16} color={colors.fgMuted} />
          </Pressable>
          <Pressable onPress={() => setPps((p) => Math.min(MAX_PPS, p * 1.5))} accessibilityRole="button" accessibilityLabel="Zoom in" hitSlop={8}>
            <Icon name="plus" size={16} color={colors.fgMuted} />
          </Pressable>
        </View>
      </View>
      <GestureDetector gesture={pinch}>
        <View>
          <ScrollView
            ref={scroller}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={onScroll}
            onScrollBeginDrag={() => {
              dragging.current = true;
              if (playing) useEditor.getState().setPlaying(false);
            }}
            onScrollEndDrag={() => {
              dragging.current = false;
            }}
            onMomentumScrollEnd={(e) => {
              dragging.current = false;
              useEditor.getState().seek(e.nativeEvent.contentOffset.x / pps);
            }}
            accessibilityLabel={`Timeline, ${clock(total, false)} long. Swipe to move the playhead`}
            contentContainerStyle={{ width: total * pps + pad * 2, paddingVertical: 4 }}
          >
            <View style={{ marginLeft: pad, width: total * pps, gap: 4 }}>
              {lanes.map((k) => (
                <View key={k} style={{ height: LANE_H[k] }}>
                  {(doc.tracks[k] as AnyClip[]).map((c) => (
                    <ClipBlock
                      key={c.id}
                      clip={c}
                      track={k}
                      pps={pps}
                      selected={selected?.id === c.id}
                      thumb={"assetId" in c ? (media[c.assetId]?.thumbnailUrl ?? null) : null}
                      sourceLength={"assetId" in c ? (media[c.assetId]?.durationSec ?? null) : null}
                    />
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
          <View style={[styles.playhead, { left: pad - 1 }]} pointerEvents="none" />
        </View>
      </GestureDetector>
    </View>
  );
}

const LABEL: Record<TrackKind, string> = { video: "Video", caption: "Caption", text: "Text", audio: "Audio", image: "Image" };

const ClipBlock = memo(function ClipBlock({
  clip,
  track,
  pps,
  selected,
  thumb,
  sourceLength,
}: {
  clip: AnyClip;
  track: TrackKind;
  pps: number;
  selected: boolean;
  thumb: string | null;
  sourceLength: number | null;
}) {
  const [drag, setDrag] = useState<{ edge: "start" | "end"; dx: number } | null>(null);
  const left = clip.timelineStart * pps + (drag?.edge === "start" ? drag.dx : 0);
  const width = Math.max(4, clip.duration * pps + (drag ? (drag.edge === "start" ? -drag.dx : drag.dx) : 0));
  const label = "text" in clip ? clip.text : LABEL[track];

  // Drag a handle: shown live, applied once on release (one undo step).
  const handle = (edge: "start" | "end") =>
    Gesture.Pan()
      .runOnJS(true)
      .onUpdate((e) => setDrag({ edge, dx: e.translationX }))
      .onEnd((e) => {
        const delta = (edge === "start" ? e.translationX : -e.translationX) / pps;
        setDrag(null);
        useEditor.getState().edit((d) => trimVideo(d, clip.id, edge, delta, sourceLength));
      })
      .onFinalize(() => setDrag(null));

  return (
    <View style={[styles.block, { left, width, height: LANE_H[track] }, track === "video" ? styles.video : styles[track === "caption" ? "caption" : track === "text" ? "text" : "audio"], selected && styles.selected]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => useEditor.getState().select(selected ? null : { track, id: clip.id })}
        accessibilityRole="button"
        aria-selected={selected}
        accessibilityLabel={`${LABEL[track]} clip${"text" in clip ? `, ${clip.text}` : ""}, ${clock(clip.timelineStart, false)} to ${clock(clip.timelineStart + clip.duration, false)}${selected ? ", selected" : ""}`}
      >
        {track === "video" && thumb ? <Image source={imageSource(thumb)} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={clip.id} /> : null}
        {track !== "video" ? (
          <Text style={[type(10, "medium", { color: colors.fg }), styles.blockText]} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
      </Pressable>
      {selected && track === "video" ? (
        <>
          <GestureDetector gesture={handle("start")}>
            <View style={[styles.handle, { left: -8 }]} accessibilityLabel="Trim start" accessibilityRole="adjustable" />
          </GestureDetector>
          <GestureDetector gesture={handle("end")}>
            <View style={[styles.handle, { right: -8 }]} accessibilityLabel="Trim end" accessibilityRole="adjustable" />
          </GestureDetector>
        </>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6, paddingVertical: 10, borderRadius: 18, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12 },
  zoom: { flexDirection: "row", gap: 16 },
  playhead: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: colors.fg },
  block: { position: "absolute", top: 0, borderRadius: 6, overflow: "visible", justifyContent: "center" },
  blockText: { paddingHorizontal: 6 },
  video: { borderWidth: 2, borderColor: colors.emerald, backgroundColor: colors.surface3, overflow: "hidden" },
  caption: { backgroundColor: withAlpha(colors.emeraldBright, 0.35) },
  text: { backgroundColor: withAlpha(colors.info, 0.4) },
  audio: { backgroundColor: withAlpha(colors.warning, 0.35) },
  selected: { borderColor: colors.fg, borderWidth: 2 },
  handle: { position: "absolute", top: -2, bottom: -2, width: 16, borderRadius: 4, backgroundColor: colors.fg },
});
