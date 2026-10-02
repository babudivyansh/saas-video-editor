import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { sample } from "@/lib/images";
import { colors, radius, type, withAlpha } from "@/theme";
import { CAPTION_TEMPLATES } from "@mocks/create";
import { caps, highlightColor } from "../create/AutoClipSheets";
import { clipAt, durationOf, useEditor, type EditorDoc } from "./store";

const WORDS = ["nobody", "tells", "you", "this", "part"];
const ACTIVE = 3;

// Colour wash approximating each filter on the still preview. Phase 9 plays
// the real video with the real filter; this only has to read as "warmer" etc.
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

export function aspectHeight(aspect: EditorDoc["aspect"], width: number) {
  return aspect === "9:16" ? (width * 16) / 9 : aspect === "1:1" ? width : (width * 9) / 16;
}

/** The frame under the playhead with the project's captions, text and look. */
export function EditorPreview({ width }: { width: number }) {
  const doc = useEditor((s) => s.doc);
  const playhead = useEditor((s) => s.playhead);
  const height = aspectHeight(doc.aspect, width);

  const seg = clipAt(doc, playhead)?.seg;

  const template = CAPTION_TEMPLATES.find((c) => c.id === doc.captions.templateId) ?? CAPTION_TEMPLATES[0];
  const accent = template?.look.highlight ? highlightColor(template.look.highlight) : colors.emeraldBright;
  const upper = template?.look.uppercase ?? false;
  const fontSize = Math.max(8, (doc.captions.sizePx * width) / 666);
  const { highlight, position } = doc.captions;
  const captionPos = position === "top" ? { top: height * 0.1 } : position === "center" ? { top: height * 0.45 } : { bottom: height * 0.14 };

  return (
    <View
      style={[styles.frame, { width, height }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Preview at ${Math.round(playhead)} of ${Math.round(durationOf(doc))} seconds, ${doc.aspect}, caption: ${WORDS.join(" ")}`}
    >
      {seg ? <Image source={sample(seg.photo)} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" /> : null}
      {FILTER_WASH[doc.look.filter] ? <View style={[StyleSheet.absoluteFill, { backgroundColor: FILTER_WASH[doc.look.filter] }]} /> : null}
      {doc.texts.map((tx, i) => (
        <Text key={tx.id} allowFontScaling={false} style={[styles.overlayText, type(Math.max(9, width / 16), "bold", { color: tx.color }), { top: height * (0.12 + i * 0.1) }]} numberOfLines={2}>
          {tx.text}
        </Text>
      ))}
      <View style={[styles.caption, captionPos]}>
        {WORDS.map((w, i) => {
          const lit = (highlight === "word" && i === ACTIVE) || highlight === "phrase" || (highlight === "karaoke" && i <= ACTIVE);
          const boxed = highlight === "word" && i === ACTIVE;
          return (
            <Text
              key={w}
              // Part of the video frame: it must not grow with the phone's text size.
              allowFontScaling={false}
              style={[
                styles.word,
                type(fontSize, "heavy", { tracking: -0.01 }),
                lit && !boxed ? { color: accent } : null,
                boxed ? { backgroundColor: accent, color: colors.bg, paddingHorizontal: 5, borderRadius: 5 } : null,
              ]}
            >
              {caps(w, upper)}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.tile, overflow: "hidden", borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surface3 },
  caption: { position: "absolute", left: 8, right: 8, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 5 },
  word: { color: colors.fg, textShadowColor: colors.bg, textShadowRadius: 10, textShadowOffset: { width: 0, height: 2 } },
  overlayText: { position: "absolute", left: 10, right: 10, textAlign: "center", textShadowColor: colors.bg, textShadowRadius: 6 },
});
