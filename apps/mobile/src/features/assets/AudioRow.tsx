import type { Asset } from "@clipiro/shared";
import { formatBytes } from "@clipiro/shared";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { create } from "zustand";
import { Avatar, Icon } from "@/components";
import { colors, derived, radius, type } from "@/theme";
import { mmss } from "../projects/format";

// One track plays at a time, through one shared player (expo-audio): pressing
// another row switches tracks, pressing the playing row pauses it, and the
// row resets when the track ends. Plays the file's signed link from the API;
// stops when the app leaves the foreground (no background playback).
type Playable = Pick<Asset, "id" | "url">;
let player: AudioPlayer | null = null;

export const usePlayer = create<{ playing: string | null; toggle: (a: Playable) => void; stop: () => void }>((set, get) => ({
  playing: null,
  toggle: (a) => {
    if (!a.url) return; // not ready, or the list hasn't been signed
    if (!player) {
      player = createAudioPlayer(null);
      player.addListener("playbackStatusUpdate", (s) => {
        if (s.didJustFinish) set({ playing: null });
      });
    }
    if (get().playing === a.id) {
      player.pause();
      set({ playing: null });
      return;
    }
    player.replace({ uri: a.url });
    player.play();
    set({ playing: a.id });
  },
  stop: () => {
    player?.pause();
    set({ playing: null });
  },
}));

AppState.addEventListener("change", (s) => {
  if (s !== "active" && usePlayer.getState().playing) usePlayer.getState().stop();
});

const SOURCE_LABEL: Record<Asset["source"], string> = {
  upload: "Audio",
  autoclip: "From AutoClip",
  "url-import": "Imported",
  editor: "From the editor",
  stock: "Stock music",
  "image-generator": "AI image",
  voiceover: "AI voice",
  "enhance-speech": "Enhance speech",
  "vocal-remover": "Vocal remover",
  "voice-changer": "Voice changer",
  "background-remover": "Background remover",
  "face-swap": "Face swap",
  "subtitle-remover": "Subtitle remover",
};

const WAVE = [30, 60, 45, 80, 50, 70, 40, 90, 55, 65, 35, 75, 50, 85, 45, 60, 30, 70, 50, 80, 40, 65];

export function AudioRow({ asset, onMore, variant = "full" }: { asset: Asset; onMore?: () => void; variant?: "full" | "compact" }) {
  const playing = usePlayer((s) => s.playing === asset.id);
  const toggle = usePlayer((s) => s.toggle);
  const label = `${SOURCE_LABEL[asset.source]}${asset.madeWith ? ` · ${asset.madeWith}` : ""}`;
  const playBtn = (
    <Pressable onPress={() => toggle(asset)} disabled={!asset.url} accessibilityRole="button" accessibilityLabel={`${playing ? "Pause" : "Play"} ${asset.name}`} style={styles.play}>
      <Icon name={playing ? "pause" : "play"} size={18} color={colors.bg} filled />
    </Pressable>
  );

  if (variant === "compact")
    return (
      <View style={styles.compact}>
        {asset.source === "voiceover" ? (
          <Avatar name={asset.madeWith ?? "AI"} size={36} decorative />
        ) : (
          <View style={styles.iconTile}>
            <Icon name={asset.source === "vocal-remover" ? "music" : "waveform"} size={18} color={colors.emeraldBright} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={type(14, "semibold")} numberOfLines={2}>
            {asset.name}
          </Text>
          <Text style={type(12, "regular", { color: colors.fgMuted })}>
            {asset.source === "voiceover" ? asset.madeWith : SOURCE_LABEL[asset.source]} · {mmss(asset.durationSec ?? 0)}
          </Text>
        </View>
        <View style={styles.miniWave} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {WAVE.slice(0, 10).map((h, i) => (
            <View key={i} style={[styles.miniBar, { height: `${h}%`, backgroundColor: playing ? colors.emeraldBright : derived.track }]} />
          ))}
        </View>
        {playBtn}
      </View>
    );

  return (
    <View style={[styles.row, playing && styles.rowOn]}>
      {playBtn}
      <View style={{ flex: 1, gap: 6 }}>
        <View style={styles.titleRow}>
          <Text style={[type(14, "semibold"), { flex: 1 }]} numberOfLines={2}>
            {asset.name}
          </Text>
          <Text style={type(12, "regular", { mono: true, color: colors.fgMuted })}>{mmss(asset.durationSec ?? 0)}</Text>
        </View>
        <View style={styles.wave} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {WAVE.map((h, i) => (
            <View key={i} style={[styles.bar, { height: `${h}%`, backgroundColor: playing ? colors.emeraldBright : derived.track }]} />
          ))}
        </View>
        <Text style={type(11, "regular", { color: colors.fgMuted })}>
          {label} · {formatBytes(asset.sizeBytes)}
        </Text>
      </View>
      {onMore ? (
        <Pressable onPress={onMore} accessibilityRole="button" accessibilityLabel={`More for ${asset.name}`} style={styles.more}>
          <Icon name="more" size={20} color={colors.fgMuted} strokeWidth={2.4} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  rowOn: { backgroundColor: colors.tint, borderColor: colors.tintBorder },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.emeraldBright, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  wave: { height: 22, flexDirection: "row", alignItems: "center", gap: 2 },
  bar: { flex: 1, borderRadius: 1 },
  more: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  compact: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  miniWave: { width: 46, height: 18, flexDirection: "row", alignItems: "center", gap: 2 },
  miniBar: { flex: 1, borderRadius: 1 },
  iconTile: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.tintBorder, alignItems: "center", justifyContent: "center" },
});
