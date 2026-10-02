import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { CreditsPill, Header, Icon, SectionHeader, StatusBarScrim, useToast, type IconName } from "@/components";
import { sample, type SampleImage } from "@/lib/images";
import { useScreenPadding } from "@/navigation/insets";
import { colors, derived, radius, text, type } from "@/theme";
import { COMING_SOON, openTool } from "../home/tools";
import { useCreateContext } from "./queries";

// design/screens/BN-CreateHub.html — the Create tab root.

const START: { key: "upload" | "link" | "assets"; label: string; icon: IconName }[] = [
  { key: "upload", label: "Upload", icon: "upload" },
  { key: "link", label: "Paste link", icon: "link" },
  { key: "assets", label: "From Assets", icon: "folder" },
];

// Real prices (lib/tool-costs.ts); Pro-only tools say so.
const AI_TOOLS: { id: string; label: string; detail: string; icon: IconName }[] = [
  { id: "image-generator", label: "Image generator", detail: "From 2 credits", icon: "image" },
  { id: "voiceover", label: "Voiceover", detail: "1 cr / 500 chars", icon: "volume" },
  { id: "enhance-speech", label: "Enhance speech", detail: "8 credits / min", icon: "waveform" },
  { id: "vocal-remover", label: "Vocal remover", detail: "1 credit / 30 s", icon: "music" },
  { id: "face-swap", label: "Face swap", detail: "Pro", icon: "person" },
  { id: "subtitle-remover", label: "Subtitle remover", detail: "Pro", icon: "captions" },
];

export function CreateHubScreen() {
  const pad = useScreenPadding();
  const toast = useToast();
  const ctx = useCreateContext();

  const startFrom = (key: (typeof START)[number]["key"]) => router.push({ pathname: "/create/autoclip", params: { start: key } });

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, pad]}>
        <Header
          title="Create"
          large
          actions={ctx.data ? <CreditsPill amount={ctx.data.clipMinutes} onPress={() => router.push("/you/credits")} /> : null}
        />

        <Pressable
          onPress={() => router.push("/create/autoclip")}
          accessibilityRole="button"
          accessibilityLabel="AutoClip. Long video in, viral clips out"
          style={({ pressed }) => [styles.hero, pressed && { opacity: 0.9 }]}
        >
          <View style={[styles.heroPhotos, { pointerEvents: "none" }]}>
            {(["creator-smile", "studio-mic", "creator-violet"] as const).map((p) => (
              <Image key={p} source={sample(p)} style={{ flex: 1 }} contentFit="cover" />
            ))}
          </View>
          <Fade id="hero" from={0.1} to={0.95} start={0.1} color={colors.bg} />
          <View style={styles.heroBody}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={type(12, "semibold", { color: colors.emeraldBright, tracking: 0.1 })}>MOST USED</Text>
              <Text style={type(22, "bold", { tracking: -0.02 })}>AutoClip</Text>
              <Text style={type(13, "regular", { color: colors.fgMuted })}>Long video in, viral clips out</Text>
            </View>
            <View style={styles.heroGo}>
              <Icon name="arrowRight" size={20} color={colors.onPrimary} strokeWidth={2.4} />
            </View>
          </View>
        </Pressable>

        <View style={{ gap: 10 }}>
          <Text style={text.label} accessibilityRole="header">
            Start from
          </Text>
          <View style={styles.row}>
            {START.map((s) => (
              <Pressable
                key={s.key}
                onPress={() => startFrom(s.key)}
                accessibilityRole="button"
                accessibilityLabel={`${s.label} a video for AutoClip`}
                style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
              >
                <Icon name={s.icon} size={22} color={colors.emeraldBright} />
                <Text style={[type(12, "medium"), styles.center]}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <Text style={text.label} accessibilityRole="header">
            Create & edit
          </Text>
          <View style={styles.row}>
            <BigCard title="Editor" body="Start from scratch" icon="editor" photo="keynote-stage" href="/editor" />
            <BigCard title="AI Media" body="Images, voiceovers, cleanup" icon="sparkle" photo="creator-golden" href="/create/ai-media" />
          </View>
        </View>

        <View style={{ gap: 2 }}>
          <SectionHeader title="AI tools" action={{ label: "All tools →", accessibilityLabel: "All tools", onPress: () => router.push("/home/recommended-tools") }} />
          <View style={styles.grid}>
            {[AI_TOOLS.slice(0, 3), AI_TOOLS.slice(3, 6)].map((row, r) => (
              <View key={r} style={styles.row}>
                {row.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => openTool(t.id) || toast(COMING_SOON, "info")}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.label}, ${t.detail}`}
                    style={({ pressed }) => [styles.tile, styles.toolTile, pressed && styles.pressed]}
                  >
                    <Icon name={t.icon} size={20} color={colors.emeraldBright} />
                    <Text style={[type(12, "medium", { lineHeight: 1.2 }), styles.center]}>{t.label}</Text>
                    <Text style={[type(11, "regular", { color: t.detail === "Pro" ? colors.warning : colors.fgSubtle }), styles.center]}>{t.detail}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      <StatusBarScrim />
    </View>
  );
}

function BigCard({ title, body, icon, photo, href }: { title: string; body: string; icon: IconName; photo: SampleImage; href: Href }) {
  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      style={({ pressed }) => [styles.big, pressed && { opacity: 0.9 }]}
    >
      <Image source={sample(photo)} style={[StyleSheet.absoluteFill, { opacity: 0.4 }]} contentFit="cover" />
      <Fade id={`big-${title}`} from={0.3} to={0.95} start={0} color={colors.surface2} />
      <View style={styles.bigIcon}>
        <Icon name={icon} size={20} color={colors.emeraldBright} />
      </View>
      <View style={styles.bigText}>
        <Text style={type(15, "bold")}>{title}</Text>
        <Text style={type(12, "regular", { color: colors.fgMuted, lineHeight: 1.3 })}>{body}</Text>
      </View>
    </Pressable>
  );
}

/** Top-to-bottom darkening over a photo. */
function Fade({ id, from, to, start, color }: { id: string; from: number; to: number; start: number; color: string }) {
  return (
    <Svg style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]} width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset={start} stopColor={color} stopOpacity={from} />
          <Stop offset="1" stopColor={color} stopOpacity={to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 14 },
  hero: { height: 220, borderRadius: radius.card, overflow: "hidden", borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surface2 },
  heroPhotos: { ...StyleSheet.absoluteFill, flexDirection: "row", gap: 4, opacity: 0.55 },
  heroBody: { position: "absolute", left: 18, right: 18, bottom: 18, flexDirection: "row", alignItems: "flex-end", gap: 12 },
  heroGo: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", gap: 10 },
  grid: { gap: 10 },
  tile: {
    flex: 1,
    minHeight: 84,
    borderRadius: radius.tile,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  toolTile: { gap: 6 },
  pressed: { backgroundColor: colors.surface3 },
  center: { textAlign: "center" },
  big: { flex: 1, height: 170, borderRadius: radius.card, overflow: "hidden", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2 },
  bigIcon: {
    position: "absolute",
    left: 14,
    top: 14,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: derived.photoChip,
    borderWidth: 1,
    borderColor: colors.tintBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  bigText: { position: "absolute", left: 14, right: 14, bottom: 14, gap: 3 },
});
