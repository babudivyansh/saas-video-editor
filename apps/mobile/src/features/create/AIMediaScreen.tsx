import {
  AUDIO_TOOLS,
  DEFAULT_IMAGE_MODEL_ID,
  MAX_PROMPT_CHARS,
  PLAN_LABEL,
  VOICEOVER_MAX_CHARS,
  formatBytes,
  imageGenerateRequest,
  planAtLeast,
  voiceoverCredits,
  voiceoverRequest,
  type AudioToolId,
  type GeneratedMedia,
  type ImageModel,
  type ImageRatio,
} from "@clipiro/shared";
import { useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BottomSheet,
  Button,
  Chip,
  CreditsPill,
  Header,
  Icon,
  OptionList,
  SectionHeader,
  Skeleton,
  StatusBarScrim,
  UnderlineTabs,
  useToast,
} from "@/components";
import { imageSource } from "@/lib/images";
import { colors, derived, radius, text, type } from "@/theme";
import { errorMessage } from "@mocks/core";
import { enhancePrompt, generateImage, generateVoiceover, runAudioTool, setFavorite } from "@mocks/create";
import { createKeys, useCreateContext, useImageModels, useRecentResults, useVoices } from "./queries";

type Tab = "image" | "voiceover" | "enhance" | "vocal";
const TABS = [
  { value: "image", label: "Image" },
  { value: "voiceover", label: "Voiceover" },
  { value: "enhance", label: "Enhance speech" },
  { value: "vocal", label: "Vocal remover" },
] as const;

// Style words added to the prompt (decision 2026-10-02: app-only presets; the
// web has none).
const PRESETS = [
  { value: "cinematic", label: "Cinematic", words: "cinematic lighting, anamorphic, film grain" },
  { value: "product", label: "Product shot", words: "studio product photo, soft box lighting, clean background" },
  { value: "portrait", label: "Portrait", words: "portrait, 85mm lens, shallow depth of field" },
  { value: "anime", label: "Anime", words: "anime style, vibrant cel shading" },
  { value: "watercolor", label: "Watercolor", words: "watercolor painting, soft washes, paper texture" },
  { value: "3d", label: "3D render", words: "3D render, octane, global illumination" },
] as const;

// design/screens/BN-AIMedia.html (Image tab). Voiceover, Enhance speech and
// Vocal remover aren't drawn; they follow the same layout.
export function AIMediaScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.value === params.tab) ? (params.tab as Tab) : "image");
  const ctx = useCreateContext();

  return (
    <View style={styles.root}>
      <View style={[styles.head, { paddingTop: insets.top + 16 }]}>
        <Header
          title="AI Media"
          onBack={() => (router.canGoBack() ? router.back() : router.replace("/create"))}
          actions={ctx.data ? <CreditsPill kind="credits" amount={ctx.data.aiCredits} onPress={() => router.push("/you/credits")} /> : null}
        />
        <UnderlineTabs accessibilityLabel="AI Media tools" tabs={TABS} value={tab} onChange={setTab} />
      </View>
      {tab === "image" ? <ImageTab /> : tab === "voiceover" ? <VoiceoverTab /> : <AudioTab key={tab} tool={tab} />}
      <StatusBarScrim />
    </View>
  );
}

// ── Shared pieces ─────────────────────────────────────────────────────────

function ActionBar({ cost, label, onPress, loading, disabled }: { cost: string; label: string; onPress: () => void; loading?: boolean; disabled?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
      <View style={{ flexShrink: 0 }}>
        <Text style={type(11, "regular", { color: colors.fgSubtle })}>Cost</Text>
        <Text style={type(14, "bold")}>{cost}</Text>
      </View>
      <Button label={label} onPress={onPress} loading={loading} disabled={disabled} style={{ flex: 1 }} />
    </View>
  );
}

function Results({ kind, title }: { kind: GeneratedMedia["kind"]; title: string }) {
  const results = useRecentResults(kind);
  const qc = useQueryClient();
  const toggle = async (m: GeneratedMedia) => {
    const key = createKeys.results(kind);
    qc.setQueryData<GeneratedMedia[]>(key, (list) => list?.map((x) => (x.id === m.id ? { ...x, favorite: !m.favorite } : x)));
    try {
      await setFavorite(m.id, !m.favorite);
    } catch {
      qc.invalidateQueries({ queryKey: key });
    }
  };
  return (
    <View style={{ gap: 4 }}>
      <SectionHeader title={title} action={{ label: "Saved to Assets", onPress: () => router.push("/projects/assets/ai-assets") }} />
      {results.isPending ? (
        <View style={styles.grid}>
          <View style={{ flex: 1 }}>
            <Skeleton height={kind === "image" ? 200 : 64} rounded={16} />
          </View>
          {kind === "image" ? (
            <View style={{ flex: 1 }}>
              <Skeleton height={200} rounded={16} />
            </View>
          ) : null}
        </View>
      ) : results.isError ? (
        <View style={styles.inlineError}>
          <Text style={[text.caption, { flex: 1 }]}>Couldn’t load your results.</Text>
          <Button label="Try again" variant="ghost" size="md" icon="refresh" iconPosition="start" onPress={() => results.refetch()} />
        </View>
      ) : results.data.length === 0 ? (
        <Text style={[text.caption, { paddingVertical: 12 }]}>
          {kind === "image" ? "Your images will show up here, and in Assets." : "Your audio will show up here, and in Assets."}
        </Text>
      ) : kind === "image" ? (
        <View style={styles.wrapGrid}>
          {results.data.slice(0, 6).map((m) => (
            <View key={m.id} style={styles.imageCard} accessible accessibilityLabel={`Generated image: ${m.title}`}>
              <Image source={imageSource(m.url)} style={StyleSheet.absoluteFill} contentFit="cover" />
              <Star on={m.favorite} onPress={() => toggle(m)} />
            </View>
          ))}
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {results.data.slice(0, 5).map((m) => (
            <View key={m.id} style={styles.audioRow}>
              <View style={styles.audioIcon}>
                <Icon name="waveform" size={18} color={colors.emeraldBright} />
              </View>
              <Text style={[type(14, "medium"), { flex: 1 }]} numberOfLines={1}>
                {m.title}
              </Text>
              <Star on={m.favorite} onPress={() => toggle(m)} inline />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Star({ on, onPress, inline = false }: { on: boolean; onPress: () => void; inline?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={on ? "Remove from favourites" : "Add to favourites"}
      aria-selected={on}
      style={[styles.star, inline && styles.starInline]}
    >
      <Icon name="star" size={18} color={on ? colors.warning : colors.fg} filled={on} />
    </Pressable>
  );
}

function TextArea({ label, value, onChange, max, placeholder, height = 96 }: { label: string; value: string; onChange: (t: string) => void; max: number; placeholder: string; height?: number }) {
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.labelRow}>
        <Text style={text.label}>{label}</Text>
        <Text style={type(11, "regular", { color: value.length > max * 0.9 ? colors.warning : colors.fgSubtle })}>
          {value.length} / {max}
        </Text>
      </View>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.fgSubtle}
        selectionColor={colors.emeraldBright}
        cursorColor={colors.emeraldBright}
        accessibilityLabel={label}
        multiline
        maxLength={max}
        style={[styles.textarea, { minHeight: height }]}
      />
    </View>
  );
}

function PillButton({ icon, label, onPress, loading }: { icon: "sparkle" | "presets"; label: string; onPress: () => void; loading?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-busy={!!loading}
      style={({ pressed }) => [styles.pill, (pressed || loading) && { backgroundColor: colors.surface3 }]}
    >
      <Icon name={icon} size={16} color={colors.emeraldBright} />
      <Text style={type(13, "medium")}>{loading ? "Working…" : label}</Text>
    </Pressable>
  );
}

// ── Image ─────────────────────────────────────────────────────────────────

function ImageTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const ctx = useCreateContext();
  const models = useImageModels();
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState(DEFAULT_IMAGE_MODEL_ID);
  const [ratio, setRatio] = useState<ImageRatio>("9:16");
  const [enhancing, setEnhancing] = useState(false);
  const [presets, setPresets] = useState(false);
  const [busy, setBusy] = useState(false);

  const plan = ctx.data?.plan ?? "free";
  const model = models.data?.find((m) => m.id === modelId);
  const ratios = model?.ratios ?? [];
  // Keep the size valid when switching to a model without it (the web snaps too).
  const shownRatio = ratios.includes(ratio) ? ratio : (ratios.includes("9:16") ? "9:16" : ratios[0]) ?? "1:1";

  const pickModel = (m: ImageModel) => {
    if (!planAtLeast(plan, m.minPlan)) return toast(`${m.name} needs the ${PLAN_LABEL[m.minPlan]} plan.`, "info");
    setModelId(m.id);
  };

  const enhance = async () => {
    if (prompt.trim().length < 3) return toast("Write a few words first, then improve them.", "info");
    setEnhancing(true);
    try {
      setPrompt((await enhancePrompt(prompt)).slice(0, MAX_PROMPT_CHARS));
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setEnhancing(false);
    }
  };

  const generate = async () => {
    const parsed = imageGenerateRequest.safeParse({ prompt, modelId, ratio: shownRatio });
    if (!parsed.success) return toast(parsed.error.issues[0]?.message ?? "Check the prompt", "info");
    if (!ctx.data) return;
    setBusy(true);
    try {
      await generateImage(parsed.data, ctx.data);
      await qc.invalidateQueries({ queryKey: createKeys.results("image") });
      toast("Image ready. Saved to Assets.", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <TextArea label="Prompt" value={prompt} onChange={setPrompt} max={MAX_PROMPT_CHARS} placeholder="A photographer on a misty mountain summit at sunrise, cinematic, 35mm" />
        <View style={styles.pills}>
          <PillButton icon="sparkle" label="Prompt generator" onPress={enhance} loading={enhancing} />
          <PillButton icon="presets" label="Presets" onPress={() => setPresets(true)} />
        </View>

        <View style={{ gap: 10 }}>
          <Text style={text.label}>Model</Text>
          {models.isPending ? (
            <Skeleton height={36} rounded={18} />
          ) : models.isError ? (
            <Button label="Couldn’t load models. Try again" variant="ghost" size="md" icon="refresh" iconPosition="start" onPress={() => models.refetch()} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {models.data.map((m) => {
                const locked = !planAtLeast(plan, m.minPlan);
                return (
                  <Chip
                    key={m.id}
                    label={locked ? `${m.name} · ${PLAN_LABEL[m.minPlan]}` : m.name}
                    selected={m.id === modelId}
                    onPress={() => pickModel(m)}
                    testID={`model-${m.id}`}
                  />
                );
              })}
            </ScrollView>
          )}
        </View>

        {ratios.length ? (
          <View style={{ gap: 10 }}>
            <Text style={text.label}>Size</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityLabel="Size">
              {ratios.map((r) => {
                const on = r === shownRatio;
                return (
                  <Pressable key={r} onPress={() => setRatio(r)} accessibilityRole="radio" aria-checked={on} style={[styles.size, on && styles.sizeOn]}>
                    <Text style={type(14, on ? "semibold" : "medium", { color: on ? colors.emeraldBright : colors.fgMuted })}>{r}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        <Results kind="image" title="Latest results" />
      </ScrollView>
      <ActionBar cost={model ? `${model.credits} credits` : "—"} label="Generate image" onPress={generate} loading={busy} disabled={!model} />

      <BottomSheet visible={presets} onClose={() => setPresets(false)} title="Presets">
        <Text style={text.caption}>Adds style words to your prompt.</Text>
        <OptionList
          accessibilityLabel="Presets"
          value={null}
          options={PRESETS.map((p) => ({ value: p.value, label: p.label, detail: p.words }))}
          onChange={(v) => {
            const words = PRESETS.find((p) => p.value === v)?.words ?? "";
            setPrompt((p) => (p.trim() ? `${p.trim().replace(/[,.\s]+$/, "")}, ${words}` : words).slice(0, MAX_PROMPT_CHARS));
            setPresets(false);
          }}
        />
      </BottomSheet>
    </>
  );
}

// ── Voiceover ─────────────────────────────────────────────────────────────

function VoiceoverTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const voices = useVoices();
  const [script, setScript] = useState("");
  const [voiceId, setVoiceId] = useState("brian");
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const voice = voices.data?.find((v) => v.id === voiceId);

  const generate = async () => {
    const parsed = voiceoverRequest.safeParse({ text: script, voiceId });
    if (!parsed.success) return toast(parsed.error.issues[0]?.message ?? "Check the script", "info");
    setBusy(true);
    try {
      await generateVoiceover(parsed.data);
      await qc.invalidateQueries({ queryKey: createKeys.results("audio") });
      toast("Voiceover ready. Saved to Assets.", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <TextArea label="Script" value={script} onChange={setScript} max={VOICEOVER_MAX_CHARS} placeholder="Type what the voice should say…" height={140} />
        <View style={{ gap: 10 }}>
          <Text style={text.label}>Voice</Text>
          <Pressable
            onPress={() => setPicking(true)}
            disabled={!voices.data}
            accessibilityRole="button"
            accessibilityLabel={voice ? `Voice: ${voice.name}, ${voice.description}. Change` : "Choose a voice"}
            style={({ pressed }) => [styles.voiceRow, pressed && { backgroundColor: colors.surface3 }]}
          >
            <View style={styles.audioIcon}>
              <Icon name="mic" size={18} color={colors.emeraldBright} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type(15, "semibold")}>{voice?.name ?? "Loading voices…"}</Text>
              {voice ? <Text style={type(12, "regular", { color: colors.fgMuted })}>{voice.description}</Text> : null}
            </View>
            <Icon name="chevronRight" size={18} color={colors.fgMuted} />
          </Pressable>
        </View>
        <Results kind="audio" title="Latest audio" />
      </ScrollView>
      <ActionBar
        cost={`${voiceoverCredits(Math.max(1, script.trim().length))} credit${voiceoverCredits(Math.max(1, script.trim().length)) === 1 ? "" : "s"}`}
        label="Generate voiceover"
        onPress={generate}
        loading={busy}
      />
      <BottomSheet visible={picking} onClose={() => setPicking(false)} title="Voice">
        <ScrollView style={{ maxHeight: 420 }}>
          <OptionList
            accessibilityLabel="Voice"
            value={voiceId}
            options={(voices.data ?? []).map((v) => ({ value: v.id, label: v.name, detail: v.description }))}
            onChange={(v) => {
              setVoiceId(v);
              setPicking(false);
            }}
          />
        </ScrollView>
      </BottomSheet>
    </>
  );
}

// ── Enhance speech / Vocal remover ────────────────────────────────────────

function AudioTab({ tool }: { tool: AudioToolId }) {
  const toast = useToast();
  const qc = useQueryClient();
  const spec = AUDIO_TOOLS[tool];
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["audio/*", "video/*"], copyToCacheDirectory: false });
    const f = res.canceled ? null : res.assets[0];
    if (!f) return;
    if ((f.size ?? 0) > spec.maxBytes) {
      setFile(null);
      return setError(`That file is over the ${formatBytes(spec.maxBytes)} limit.`);
    }
    setError(null);
    setFile({ name: f.name, size: f.size ?? 0 });
  };

  const run = async () => {
    if (!file) return;
    setBusy(true);
    try {
      await runAudioTool(tool, file.name);
      await qc.invalidateQueries({ queryKey: createKeys.results("audio") });
      toast(`${tool === "enhance" ? "Clean audio" : "Instrumental"} ready. Saved to Assets.`, "success");
      setFile(null);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const rate = tool === "enhance" ? "8 credits / min" : "1 credit / 30 s";
  const maxLen = spec.maxSec % 60 === 0 ? `${spec.maxSec / 60} min` : `${spec.maxSec} s`;
  return (
    <>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={text.caption}>{tool === "enhance" ? "Removes background noise and room echo from a voice recording." : "Splits the vocals out of a song and keeps the music."}</Text>
        {file ? (
          <View style={styles.voiceRow}>
            <View style={styles.audioIcon}>
              <Icon name="file" size={18} color={colors.emeraldBright} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type(14, "semibold")} numberOfLines={1}>
                {file.name}
              </Text>
              <Text style={type(12, "regular", { color: colors.fgMuted })}>{formatBytes(file.size)}</Text>
            </View>
            <Button label="Change" variant="ghost" size="md" onPress={pick} />
          </View>
        ) : (
          <Pressable
            onPress={pick}
            accessibilityRole="button"
            accessibilityLabel={`Choose an audio or video file, up to ${formatBytes(spec.maxBytes)} and ${maxLen}`}
            style={({ pressed }) => [styles.drop, pressed && { backgroundColor: colors.surface3 }]}
          >
            <View style={styles.dropIcon}>
              <Icon name="cloudUpload" size={22} color={colors.emeraldBright} />
            </View>
            <Text style={type(15, "bold")}>Choose a file</Text>
            <Text style={[type(12, "regular", { color: colors.fgMuted }), { textAlign: "center" }]}>
              MP3, WAV, M4A, MP4, MOV… · up to {formatBytes(spec.maxBytes)}, {maxLen}
            </Text>
          </Pressable>
        )}
        {error ? (
          <Text style={type(12, "medium", { color: colors.error })} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <Text style={text.caption}>You get: {spec.output}</Text>
        <Results kind="audio" title="Latest audio" />
      </ScrollView>
      <ActionBar
        cost={rate}
        label={tool === "enhance" ? "Enhance speech" : "Remove vocals"}
        onPress={run}
        loading={busy}
        disabled={!file}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: 16, gap: 8 },
  body: { padding: 16, gap: 16, paddingBottom: 140 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  textarea: {
    ...type(15, "regular", { lineHeight: 1.5 }),
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.tile,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    textAlignVertical: "top",
  },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  size: {
    minWidth: 72,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  sizeOn: { backgroundColor: colors.tint, borderColor: colors.emeraldBright },
  grid: { flexDirection: "row", gap: 10 },
  wrapGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  imageCard: { width: "48.5%", height: 200, borderRadius: radius.tile, overflow: "hidden", backgroundColor: colors.surface3 },
  star: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: derived.overlay,
    alignItems: "center",
    justifyContent: "center",
  },
  starInline: { position: "relative", right: 0, bottom: 0, backgroundColor: "transparent" },
  audioRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 12, minHeight: 56, borderRadius: radius.tile, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  audioIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.tint, alignItems: "center", justifyContent: "center" },
  voiceRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, minHeight: 60, borderRadius: radius.tile, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  drop: {
    alignItems: "center",
    gap: 8,
    padding: 20,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.tintBorder,
    backgroundColor: colors.surface2,
  },
  dropIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.tint, alignItems: "center", justifyContent: "center" },
  inlineError: { flexDirection: "row", alignItems: "center", gap: 8 },
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
