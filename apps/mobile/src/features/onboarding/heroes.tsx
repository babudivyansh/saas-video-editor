import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { Icon, ProgressBar, ScoreBadge, type IconName } from "@/components";
import { colors, derived, radius, text, type } from "@/theme";
import { heroCard } from "./OnboardingPage";

// The illustration on each onboarding page, laid over the photo wall.
// Positions are the design's (design/screens/E-Welcome … E-Grow); all
// numbers shown are sample data, labelled as such where the design does.

const img = {
  smile: require("../../../assets/images/creator-smile.jpg"),
  portrait: require("../../../assets/images/founder-portrait.jpg"),
  violet: require("../../../assets/images/creator-violet.jpg"),
  studio: require("../../../assets/images/studio-mic.jpg"),
  gym: require("../../../assets/images/gym-lift.jpg"),
};

// ── 1. Welcome: source → output ──────────────────────────────────────────
export function WelcomeHero() {
  return (
    <View style={[styles.abs, { top: 372, left: 24, right: 24 }, styles.twoCols]}>
      <StatCard label="Source" value="1 video" note="58 min podcast" />
      <StatCard label="Output" value="12 clips" note="Ready to post" />
    </View>
  );
}

function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <View style={[styles.stat, heroCard]} accessible accessibilityLabel={`${label}: ${value}, ${note}`}>
      <Text style={text.label}>{label}</Text>
      <Text style={type(24, "bold", { tracking: -0.02 })}>{value}</Text>
      <Text style={type(11, "regular", { color: colors.emeraldBright })}>{note}</Text>
    </View>
  );
}

// ── 2. Generate: a project with ranked clips ─────────────────────────────
const CLIPS = [
  { src: img.smile, score: 92, len: "0:41" },
  { src: img.portrait, score: 88, len: "0:28" },
  { src: img.violet, score: 81, len: "0:35" },
];

export function GenerateHero() {
  return (
    <View
      style={[styles.abs, { top: 96, left: 24, right: 24 }, styles.card, heroCard]}
      accessible
      accessibilityLabel="Sample project Founders Pod episode 42, AutoClip, 3 of 12 clips ready, top hook scores 92, 88 and 81"
    >
      <View style={styles.projectRow}>
        <Image source={img.studio} style={styles.projectThumb} contentFit="cover" />
        <View style={{ flex: 1 }}>
          <Text style={type(15, "bold")} numberOfLines={1}>
            Founders Pod · Ep. 42
          </Text>
          <Text style={type(12, "regular", { color: colors.fgMuted })}>AutoClip · 3 of 12 ready</Text>
        </View>
      </View>
      <ProgressBar value={25} label="3 of 12 clips ready" />
      <View style={styles.clips}>
        {CLIPS.map((c) => (
          <View key={c.score} style={styles.clip}>
            <Image source={c.src} style={StyleSheet.absoluteFill} contentFit="cover" />
            <View style={styles.clipScore}>
              <ScoreBadge score={c.score} compact />
            </View>
            <View style={styles.clipLen}>
              <Text style={type(11, "medium", { mono: true })}>{c.len}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={type(11, "regular", { color: colors.fgSubtle })}>Badge = hook score. Sample data.</Text>
    </View>
  );
}

// ── 3. Create: a vertical clip with captions + feature chips ──────────────
export function CreateHero() {
  return (
    <>
      <View
        style={[styles.abs, styles.phone, heroCard]}
        accessible
        accessibilityLabel="Sample vertical clip with the caption One more rep"
      >
        <Image source={img.gym} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={styles.caption}>
          <Text style={styles.captionWord} maxFontSizeMultiplier={1}>ONE MORE </Text>
          <View style={styles.captionHighlight}>
            <Text style={[styles.captionWord, { color: colors.bg }]} maxFontSizeMultiplier={1}>
              REP
            </Text>
          </View>
        </View>
      </View>
      {/* The chips and the burned-in caption are part of the illustration (pinned
          to the photo card), so they don’t grow with the font scale — scaled up
          they cover each other. Their text is still read via accessibilityLabel. */}
      <FeatureChip icon="captions" label="Captions" style={{ left: 20, top: 150 }} />
      <FeatureChip icon="crop" label="9:16 reframe" style={{ right: 20, top: 250 }} />
      <FeatureChip icon="wand" label="Brand kit" style={{ left: 28, top: 360 }} />
    </>
  );
}

function FeatureChip({ icon, label, style }: { icon: IconName; label: string; style: object }) {
  return (
    <View style={[styles.abs, styles.chip, style]} accessible accessibilityLabel={label}>
      <Icon name={icon} size={14} color={colors.emeraldBright} />
      <Text style={type(12, "semibold")} maxFontSizeMultiplier={1}>
        {label}
      </Text>
    </View>
  );
}

// ── 4. Grow: results across platforms ────────────────────────────────────
const BARS = [30, 42, 38, 55, 50, 78, 96];

export function GrowHero() {
  return (
    <View style={[styles.abs, { top: 96, left: 24, right: 24, gap: 10 }]}>
      <View style={styles.twoCols}>
        <StatCard label="Views" value="48.2k" note="+18% this week" />
        <StatCard label="Published" value="24" note="3 platforms" />
      </View>
      <View
        style={[styles.card, heroCard, { gap: 14 }]}
        accessible
        accessibilityLabel="Sample chart of the last 7 days: views rising, highest on the last two days"
      >
        <View style={styles.chartHead}>
          <Text style={type(13, "semibold")}>Last 7 days</Text>
          <Text style={type(11, "regular", { color: colors.fgSubtle })}>Sample data</Text>
        </View>
        <View style={styles.bars}>
          {BARS.map((h, i) => (
            <View key={i} style={[styles.bar, { height: `${h}%`, backgroundColor: i >= 5 ? colors.emeraldBright : colors.surface3 }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: "absolute" },
  twoCols: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, padding: 14, borderRadius: radius.tile, gap: 4 },
  card: { padding: 16, borderRadius: radius.card, gap: 12 },
  projectRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  projectThumb: { width: 64, height: 40, borderRadius: 8 },
  clips: { flexDirection: "row", gap: 8 },
  clip: { flex: 1, aspectRatio: 0.72, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surface3 },
  clipScore: { position: "absolute", left: 6, top: 6 },
  clipLen: { position: "absolute", right: 6, bottom: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: derived.overlay },
  phone: { left: "50%", marginLeft: -110, top: 60, width: 220, height: 391, borderRadius: radius.card, overflow: "hidden" },
  caption: { position: "absolute", left: 0, right: 0, bottom: 64, flexDirection: "row", justifyContent: "center", alignItems: "center" },
  captionWord: { ...type(22, "heavy", { tracking: -0.01 }), textShadowColor: derived.scrim, textShadowRadius: 10, textShadowOffset: { width: 0, height: 2 } },
  captionHighlight: { backgroundColor: colors.emeraldBright, paddingHorizontal: 6, borderRadius: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: derived.overlay,
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  chartHead: { flexDirection: "row", justifyContent: "space-between" },
  bars: { height: 110, flexDirection: "row", alignItems: "flex-end", gap: 8 },
  bar: { flex: 1, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
});
