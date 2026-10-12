import {
  AUTOCLIP_FILE_TYPES,
  AUTOCLIP_LIMITS,
  CLIP_LENGTHS,
  MAX_CLIPS_PER_RUN,
  PLAN_LABEL,
  autoClipMinutes,
  formatBytes,
  formatHours,
  uploadProblem,
  type AutoClipSource,
} from "@clipiro/shared";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, CreditsPill, EmptyState, Header, Icon, IconButton, SkeletonCard, StatusBarScrim, Stepper, useToast } from "@/components";
import { sample } from "@/lib/images";
import { SCREENS } from "@/navigation/screens";
import { colors, layout, radius, text, type } from "@/theme";
import { ApiError, errorMessage } from "@mocks/core";
import { CAPTION_TEMPLATES, startAutoClip } from "@mocks/create";
import { useAutoClipDraft } from "./draft";
import { useCreateContext } from "./queries";
import { AdvancedSheet, AssetSheet, CaptionSheet, ClipLengthSheet, LinkSheet, RatioSheet, caps, highlightColor } from "./AutoClipSheets";

type Sheet = "link" | "assets" | "length" | "ratio" | "captions" | "advanced" | null;

// design/screens/BN-Create.html — set up an AutoClip run.
export function AutoClipScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const ctx = useCreateContext();
  const { start } = useLocalSearchParams<{ start?: "upload" | "link" | "assets" }>();
  const { source, settings, setSource, update } = useAutoClipDraft();
  // "Start from" on the Create hub lands here with ?start=link|assets|upload.
  const [sheet, setSheet] = useState<Sheet>(() => (start === "link" || start === "assets" ? start : null));
  const [fileError, setFileError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const handledStart = useRef(false);

  const plan = ctx.data?.plan ?? "free";
  const limits = AUTOCLIP_LIMITS[plan];

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: [...AUTOCLIP_FILE_TYPES], copyToCacheDirectory: false, multiple: false });
    const file = res.canceled ? null : res.assets[0];
    if (!file) return;
    const mimeType = file.mimeType ?? "";
    const problem = uploadProblem({ sizeBytes: file.size ?? 0, mimeType }, plan);
    setFileError(problem);
    if (problem) return;
    setSource({ kind: "upload", fileName: file.name, sizeBytes: file.size ?? 0, mimeType: mimeType as (typeof AUTOCLIP_FILE_TYPES)[number], durationSec: null });
  };

  // ?start=upload opens the file picker once the plan (and so the limits) is known.
  useEffect(() => {
    if (start !== "upload" || handledStart.current || !ctx.data) return;
    handledStart.current = true;
    void pickFile();
    // pickFile reads the plan from ctx, which is ready here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, ctx.data]);

  const minutes = source?.durationSec ? autoClipMinutes(source.durationSec) : null;
  const short = ctx.data && minutes != null && minutes > ctx.data.clipMinutes;

  const generate = async () => {
    if (!source || !ctx.data) return;
    if (short) return router.push("/you/credits");
    setStarting(true);
    try {
      await startAutoClip({ source, settings }, { clipMinutes: ctx.data.clipMinutes });
      toast("AutoClip started. We'll let you know when your clips are ready.", "success");
      useAutoClipDraft.getState().reset();
      router.push(SCREENS["BN-Insights"].href as never);
    } catch (e) {
      toast(errorMessage(e), e instanceof ApiError && e.status === 402 ? "info" : "error");
    } finally {
      setStarting(false);
    }
  };

  const length = CLIP_LENGTHS.find((l) => l.id === settings.clipLength) ?? CLIP_LENGTHS[1];
  const caption = CAPTION_TEMPLATES.find((c) => c.id === settings.captionTemplateId) ?? null;
  const barBottom = layout.tabBar.height + layout.tabBar.inset + insets.bottom;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: barBottom + 96 }]}>
        <Header
          title="AutoClip"
          large
          actions={ctx.data ? <CreditsPill amount={ctx.data.clipMinutes} onPress={() => router.push("/you/credits")} /> : null}
        />

        {ctx.isPending ? (
          <>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </>
        ) : ctx.isError ? (
          <EmptyState tone="error" title="Couldn’t load AutoClip" body={errorMessage(ctx.error)} action={{ label: "Try again", onPress: () => ctx.refetch() }} />
        ) : (
          <>
            {source ? (
              <SourceCard source={source} onChange={() => setSource(null)} />
            ) : (
              <View style={styles.row}>
                <Pressable
                  onPress={pickFile}
                  accessibilityRole="button"
                  accessibilityLabel={`Upload video. MP4, MOV or WebM, up to ${formatBytes(limits.maxBytes)} and ${formatHours(limits.maxSourceSec)}`}
                  style={({ pressed }) => [styles.card, styles.upload, pressed && styles.pressed]}
                >
                  <View style={styles.uploadIcon}>
                    <Icon name="cloudUpload" size={22} color={colors.emeraldBright} />
                  </View>
                  <Text style={type(16, "bold")}>Upload video</Text>
                  <Text style={type(11, "regular", { color: colors.fgMuted })}>
                    MP4, MOV, WebM · {PLAN_LABEL[plan]} plan: up to {formatBytes(limits.maxBytes)}, {formatHours(limits.maxSourceSec)}
                  </Text>
                </Pressable>
                <View style={styles.col}>
                  <SourceTile icon="link" title="Paste link" body="YouTube, Vimeo, Loom…" onPress={() => setSheet("link")} />
                  <SourceTile
                    icon="folder"
                    title="From Assets"
                    body={ctx.data.videoAssets.length ? `${ctx.data.videoAssets.length} files` : "No videos yet"}
                    onPress={() => setSheet("assets")}
                  />
                </View>
              </View>
            )}
            {fileError ? (
              <Text style={type(12, "medium", { color: colors.error })} accessibilityLiveRegion="polite">
                {fileError}
              </Text>
            ) : null}

            <Text style={text.label} accessibilityRole="header">
              Settings
            </Text>
            <View style={styles.row}>
              <View style={styles.col}>
                <SettingTile label="Clip length" onPress={() => setSheet("length")} a11y={`Clip length, ${length.label}. Tap to change`}>
                  <Text style={type(24, "bold")}>{length.label}</Text>
                  <Text style={type(11, "regular", { color: colors.fgMuted })}>Tap to change</Text>
                </SettingTile>
                <View style={[styles.card, styles.setting]}>
                  <Text style={text.label}>Clips</Text>
                  <Stepper label="Clips" value={settings.clipCount} min={1} max={MAX_CLIPS_PER_RUN} onChange={(clipCount) => update({ clipCount })} />
                </View>
              </View>
              <Pressable
                onPress={() => setSheet("captions")}
                accessibilityRole="button"
                accessibilityLabel={`Captions, ${caption ? caption.name : "off"}. Tap to change`}
                style={({ pressed }) => [styles.card, styles.setting, styles.captions, pressed && styles.pressed]}
              >
                <Image source={sample("creator-violet")} style={[StyleSheet.absoluteFill, { opacity: 0.55 }]} contentFit="cover" />
                <Text style={text.label}>Captions</Text>
                <View style={{ marginTop: "auto", gap: 6 }}>
                  {caption ? (
                    <View style={styles.previewWords}>
                      <Text style={styles.previewWord}>{caps("Watch", caption.look.uppercase)}</Text>
                      <Text
                        style={[
                          styles.previewWord,
                          caption.look.highlight ? { backgroundColor: highlightColor(caption.look.highlight), color: colors.bg, paddingHorizontal: 6, borderRadius: 6 } : null,
                        ]}
                      >
                        {caps("this", caption.look.uppercase)}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={type(12, "semibold")}>{caption ? caption.name : "Captions off"}</Text>
                </View>
              </Pressable>
            </View>
            <View style={styles.row}>
              <SettingTile label="Ratio" onPress={() => setSheet("ratio")} a11y={`Ratio, ${settings.aspectRatio}. Tap to change`}>
                <View style={styles.ratioRow}>
                  <RatioGlyph ratio={settings.aspectRatio} />
                  <Text style={type(24, "bold")}>{settings.aspectRatio}</Text>
                </View>
              </SettingTile>
              <SettingTile label="" onPress={() => setSheet("advanced")} a11y="Advanced. Reframe, zoom, speaker mode, silences">
                <View style={styles.advHead}>
                  <Icon name="sliders" size={18} color={colors.emeraldBright} />
                  <Text style={[type(13, "semibold"), { flex: 1 }]}>Advanced</Text>
                  <Icon name="chevronRight" size={16} color={colors.fgMuted} />
                </View>
                <Text style={type(11, "regular", { color: colors.fgMuted })}>Reframe, zoom, speaker mode, silences</Text>
              </SettingTile>
            </View>
          </>
        )}
      </ScrollView>

      {ctx.data ? (
        <View style={[styles.bar, { bottom: barBottom }]}>
          <View style={{ flexShrink: 0 }}>
            <Text style={type(11, "regular", { color: colors.fgSubtle })}>Cost</Text>
            <Text style={type(14, "bold", { color: short ? colors.error : colors.fg })}>
              {minutes != null ? `~${minutes} min` : source ? "1 min / video min" : "—"}
            </Text>
          </View>
          <Button
            label={short ? "Get more minutes" : "Generate clips"}
            onPress={generate}
            loading={starting}
            disabled={!source}
            style={{ flex: 1 }}
            accessibilityHint={!source ? "Choose a video first" : short ? `You have ${ctx.data.clipMinutes} Clip Minutes` : undefined}
          />
        </View>
      ) : null}
      <StatusBarScrim />

      <LinkSheet
        visible={sheet === "link"}
        onClose={() => setSheet(null)}
        onPick={(s) => {
          setSource(s);
          setSheet(null);
        }}
      />
      <AssetSheet
        visible={sheet === "assets"}
        assets={ctx.data?.videoAssets ?? []}
        onClose={() => setSheet(null)}
        onPick={(a) => {
          setSource({ kind: "asset", assetId: a.id, title: a.title, durationSec: a.durationSec });
          setSheet(null);
        }}
      />
      <ClipLengthSheet visible={sheet === "length"} value={settings.clipLength} onClose={() => setSheet(null)} onChange={(clipLength) => update({ clipLength })} />
      <RatioSheet visible={sheet === "ratio"} value={settings.aspectRatio} onClose={() => setSheet(null)} onChange={(aspectRatio) => update({ aspectRatio })} />
      <CaptionSheet
        visible={sheet === "captions"}
        value={settings.captionTemplateId}
        onClose={() => setSheet(null)}
        onChange={(captionTemplateId) => update({ captionTemplateId })}
      />
      <AdvancedSheet visible={sheet === "advanced"} onClose={() => setSheet(null)} />
    </View>
  );
}

function SourceTile({ icon, title, body, onPress }: { icon: "link" | "folder"; title: string; body: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${body}`} style={({ pressed }) => [styles.card, styles.sourceTile, pressed && styles.pressed]}>
      <Icon name={icon} size={20} color={colors.emeraldBright} />
      <Text style={type(14, "semibold")}>{title}</Text>
      <Text style={type(11, "regular", { color: colors.fgMuted })} numberOfLines={2}>
        {body}
      </Text>
    </Pressable>
  );
}

function SettingTile({ label, a11y, onPress, children }: { label: string; a11y: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} style={({ pressed }) => [styles.card, styles.setting, { flex: 1 }, pressed && styles.pressed]}>
      {label ? <Text style={text.label}>{label}</Text> : null}
      {children}
    </Pressable>
  );
}

function SourceCard({ source, onChange }: { source: AutoClipSource; onChange: () => void }) {
  const title = source.kind === "upload" ? source.fileName : source.kind === "link" ? (source.title ?? source.url) : source.title;
  const meta =
    source.kind === "upload"
      ? `${formatBytes(source.sizeBytes)} · Uploads when you generate`
      : source.kind === "link"
        ? `${source.durationSec ? formatHours(source.durationSec) : "Length unknown"} · ${new URL(source.url).hostname.replace(/^www\./, "")}`
        : `${formatHours(source.durationSec)} · From Assets`;
  return (
    <View style={[styles.card, styles.sourceCard]} accessible accessibilityLabel={`Video: ${title}. ${meta}`}>
      <View style={styles.sourceThumb}>
        <Icon name={source.kind === "link" ? "link" : source.kind === "asset" ? "folder" : "file"} size={22} color={colors.emeraldBright} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type(14, "semibold")} numberOfLines={2}>
          {title}
        </Text>
        <Text style={type(12, "regular", { color: colors.fgMuted })}>{meta}</Text>
      </View>
      <IconButton icon="close" accessibilityLabel="Remove this video" onPress={onChange} />
    </View>
  );
}

function RatioGlyph({ ratio }: { ratio: "9:16" | "16:9" | "1:1" }) {
  const [w, h] = ratio === "9:16" ? [18, 32] : ratio === "16:9" ? [32, 18] : [26, 26];
  return <View style={{ width: w, height: h, borderRadius: 4, borderWidth: 2, borderColor: colors.emeraldBright }} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 12 },
  row: { flexDirection: "row", gap: 10 },
  col: { flex: 1, gap: 10 },
  card: { borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  pressed: { backgroundColor: colors.surface3 },
  upload: { flex: 1, padding: 16, gap: 10, justifyContent: "flex-end", minHeight: 202, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.tintBorder },
  uploadIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.tintBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  sourceTile: { flex: 1, padding: 16, gap: 8, minHeight: 96 },
  setting: { padding: 14, gap: 10, minHeight: 88 },
  captions: { flex: 1 },
  previewWords: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  previewWord: {
    ...type(16, "heavy", { tracking: -0.01 }),
    textShadowColor: colors.bg,
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 2 },
  },
  ratioRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  advHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  sourceCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  sourceThumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: colors.tint, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  bar: { position: "absolute", left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.bg },
});
