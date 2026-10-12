import {
  AUDIO_TOOLS,
  audioToolCredits,
  DEFAULT_IMAGE_MODEL_ID,
  MAX_PROMPT_CHARS,
  PLAN_LABEL,
  VOICEOVER_MAX_CHARS,
  imageGenerateRequest,
  planAtLeast,
  voiceoverCredits,
  voiceoverRequest,
  type AudioToolId,
  type ImageModel,
  type ImageRatio,
} from "@clipiro/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheet, Button, Chip, CreditsPill, Header, Icon, OptionList, Skeleton, StatusBarScrim, UnderlineTabs, useToast } from "@/components";
import { createTools, jobs } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { colors, radius, text, type } from "@/theme";
import { usePlayer } from "../assets/AudioRow";
import { useCreateContext, useImageModels, useVoices } from "./queries";
import { ActionBar, FileCard, newKey, Results, useFileInput, useToolJob, Working } from "./toolKit";

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
  const params = useLocalSearchParams<{ tab?: Tab; voice?: string }>();
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
      {tab === "image" ? <ImageTab /> : tab === "voiceover" ? <VoiceoverTab initialVoice={params.voice} /> : <AudioTab key={tab} tool={tab} />}
      <StatusBarScrim />
    </View>
  );
}

// ── Shared pieces ─────────────────────────────────────────────────────────

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
  const ctx = useCreateContext();
  const models = useImageModels();
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState(DEFAULT_IMAGE_MODEL_ID);
  const [ratio, setRatio] = useState<ImageRatio>("9:16");
  const [enhancing, setEnhancing] = useState(false);
  const [presets, setPresets] = useState(false);

  const plan = ctx.data?.plan ?? "free";
  const model = models.data?.find((m) => m.id === modelId);
  const ratios = model?.ratios ?? [];
  // Keep the size valid when switching to a model without it (the web snaps too).
  const shownRatio = ratios.includes(ratio) ? ratio : (ratios.includes("9:16") ? "9:16" : ratios[0]) ?? "1:1";
  const job = useToolJob(model?.credits ?? 0);

  const pickModel = (m: ImageModel) => {
    if (!planAtLeast(plan, m.minPlan)) return toast(`${m.name} needs the ${PLAN_LABEL[m.minPlan]} plan.`, "info");
    setModelId(m.id);
  };

  const enhance = async () => {
    if (prompt.trim().length < 3) return toast("Write a few words first, then improve them.", "info");
    setEnhancing(true);
    try {
      setPrompt((await createTools.enhancePrompt(prompt.slice(0, MAX_PROMPT_CHARS))).prompt.slice(0, MAX_PROMPT_CHARS));
    } catch (e) {
      toast(apiErrorMessage(e), "error");
    } finally {
      setEnhancing(false);
    }
  };

  const generate = async () => {
    const parsed = imageGenerateRequest.safeParse({ prompt, modelId, ratio: shownRatio });
    if (!parsed.success) return toast(parsed.error.issues[0]?.message ?? "Check the prompt", "info");
    if (model && !planAtLeast(plan, model.minPlan)) return toast(`${model.name} needs the ${PLAN_LABEL[model.minPlan]} plan.`, "info");
    const done = await job.run(() => jobs.start({ type: "ai-image", ...parsed.data, idempotencyKey: newKey() }));
    if (done) toast("Image ready. Saved to Assets.", "success");
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

        {job.progress != null ? <Working progress={job.progress} label={`Generating with ${model?.name ?? "the model"}…`} /> : null}
        <Results kind="image" title="Latest results" />
      </ScrollView>
      <ActionBar cost={model ? `${model.credits} credits` : "—"} label="Generate image" onPress={() => void generate()} loading={job.busy} disabled={!model} />
      {job.sheet}

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

/** `initialVoice`: preselected from My Voices ("Use"). */
function VoiceoverTab({ initialVoice }: { initialVoice?: string }) {
  const toast = useToast();
  const voices = useVoices();
  const playing = usePlayer((s) => s.playing);
  const [script, setScript] = useState("");
  const [voiceId, setVoiceId] = useState(initialVoice ?? null);
  const [picking, setPicking] = useState(false);
  const list = voices.data?.voices ?? [];
  const voice = list.find((v) => v.id === voiceId) ?? list.find((v) => !v.id.startsWith("clone:")) ?? list[0]; // a catalogue voice, unless one was chosen
  // 1 credit per 500 characters, the same for every voice (what the server charges).
  const cost = voiceoverCredits(Math.max(1, script.trim().length));
  const job = useToolJob(cost);
  const unavailable = voices.isError || (voices.data && (!voices.data.configured || list.length === 0));

  const generate = async () => {
    const parsed = voiceoverRequest.safeParse({ text: script, voiceId: voice?.id ?? "" });
    if (!parsed.success || !voice) return toast(parsed.success ? "Choose a voice" : (parsed.error.issues[0]?.message ?? "Check the script"), "info");
    const done = await job.run(() => jobs.start({ type: "voiceover", text: parsed.data.text, voiceId: voice.id, title: `Voiceover · ${voice.name}`, idempotencyKey: newKey() }));
    if (done) {
      toast("Voiceover ready. Saved to Assets.", "success");
      setScript("");
    }
  };

  const preview = (v: { id: string; previewUrl: string | null }) => v.previewUrl && usePlayer.getState().toggle({ id: `voice:${v.id}`, url: v.previewUrl });

  return (
    <>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <TextArea label="Script" value={script} onChange={setScript} max={VOICEOVER_MAX_CHARS} placeholder="Type what the voice should say…" height={140} />
        <View style={{ gap: 10 }}>
          <Text style={text.label}>Voice</Text>
          {unavailable ? (
            <Text style={text.caption}>Voiceover isn’t available right now. Try again later.</Text>
          ) : (
            <View style={styles.voiceRow}>
              <Pressable
                onPress={() => voice && preview(voice)}
                disabled={!voice?.previewUrl}
                accessibilityRole="button"
                accessibilityLabel={voice ? `${playing === `voice:${voice.id}` ? "Stop" : "Play"} a sample of ${voice.name}` : "Loading voices"}
                style={styles.audioIcon}
              >
                <Icon name={voice && playing === `voice:${voice.id}` ? "pause" : voice?.previewUrl ? "play" : "mic"} size={18} color={colors.emeraldBright} />
              </Pressable>
              <Pressable
                onPress={() => setPicking(true)}
                disabled={!list.length}
                accessibilityRole="button"
                accessibilityLabel={voice ? `Voice: ${voice.name}${voice.description ? `, ${voice.description}` : ""}. Change` : "Choose a voice"}
                style={styles.voicePick}
              >
                <View style={{ flex: 1 }}>
                  <Text style={type(15, "semibold")}>{voice?.name ?? "Loading voices…"}</Text>
                  {voice ? <Text style={type(12, "regular", { color: colors.fgMuted })}>{[voice.description, voice.accent].filter(Boolean).join(" · ")}</Text> : null}
                </View>
                <Icon name="chevronRight" size={18} color={colors.fgMuted} />
              </Pressable>
            </View>
          )}
        </View>
        {job.progress != null ? <Working progress={job.progress} label={`Recording with ${voice?.name ?? "the voice"}…`} /> : null}
        <Results kind="audio" title="Latest audio" />
      </ScrollView>
      <ActionBar cost={`${cost} credit${cost === 1 ? "" : "s"}`} label="Generate voiceover" onPress={() => void generate()} loading={job.busy} disabled={!!unavailable || !voice} />
      <BottomSheet visible={picking} onClose={() => setPicking(false)} title="Voice">
        <ScrollView style={{ maxHeight: 420 }}>
          <OptionList
            accessibilityLabel="Voice"
            value={voice?.id ?? null}
            options={list.map((v) => ({ value: v.id, label: v.name, detail: [v.description, v.accent].filter(Boolean).join(" · ") || undefined }))}
            onChange={(v) => {
              setVoiceId(v);
              setPicking(false);
            }}
          />
        </ScrollView>
      </BottomSheet>
      {job.sheet}
    </>
  );
}

// ── Enhance speech / Vocal remover ────────────────────────────────────────

// The length is read on the phone so the price and the tool's length limit
// show before anything is charged; the server checks both again.
function AudioTab({ tool }: { tool: AudioToolId }) {
  const toast = useToast();
  const spec = AUDIO_TOOLS[tool];
  const fileSpec = { name: spec.name, accepts: ["audio", "video"] as const, maxBytes: spec.maxBytes, maxSec: spec.maxSec };
  const input = useFileInput(fileSpec);
  const cost = input.source?.durationSec ? audioToolCredits(tool, input.source.durationSec) : 0;
  const job = useToolJob(cost);

  const run = async () => {
    const done = await job.run(async () => jobs.start({ type: tool === "enhance" ? "enhance-speech" : "vocal-remover", assetId: await input.assetId(), idempotencyKey: newKey() }));
    if (done) {
      toast(`${tool === "enhance" ? "Clean audio" : "Instrumental"} ready. Saved to Assets.`, "success");
      input.clear();
    }
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={text.caption}>{tool === "enhance" ? "Removes background noise and room echo from a voice recording." : "Splits the vocals out of a song and keeps the music."}</Text>
        <FileCard input={input} spec={fileSpec} disabled={job.busy} />
        {input.uploading != null ? <Working progress={Math.round(input.uploading * 100)} label="Uploading to Assets…" /> : job.progress != null ? <Working progress={job.progress} label={`${spec.name}…`} /> : null}
        <Text style={text.caption}>You get: {spec.output}</Text>
        <Results kind="audio" title="Latest audio" />
      </ScrollView>
      <ActionBar
        cost={input.source ? `${cost} credit${cost === 1 ? "" : "s"}` : tool === "enhance" ? "8 credits / min" : "1 credit / 30 s"}
        label={tool === "enhance" ? "Enhance speech" : "Remove vocals"}
        onPress={() => void run()}
        loading={job.busy}
        disabled={!input.source}
      />
      {job.sheet}
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
  audioIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.tint, alignItems: "center", justifyContent: "center" },
  voicePick: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  voiceRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, minHeight: 60, borderRadius: radius.tile, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
});
