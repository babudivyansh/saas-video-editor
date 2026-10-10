import {
  ApiError,
  AUDIO_TOOLS,
  assetUploadProblem,
  audioToolCredits,
  DEFAULT_IMAGE_MODEL_ID,
  MAX_PROMPT_CHARS,
  PLAN_LABEL,
  VOICEOVER_MAX_CHARS,
  formatBytes,
  imageGenerateRequest,
  planAtLeast,
  voiceoverCredits,
  voiceoverRequest,
  type Asset,
  type AudioToolId,
  type ImageModel,
  type Job,
  type ImageRatio,
} from "@clipiro/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  ProgressBar,
  SectionHeader,
  Skeleton,
  StatusBarScrim,
  UnderlineTabs,
  useToast,
} from "@/components";
import { assets, createTools, jobs } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { imageSource } from "@/lib/images";
import { pollMs } from "@/lib/poll";
import { colors, derived, radius, text, type } from "@/theme";
import { probeDuration } from "@/lib/probe";
import { useAssetStorage, usePlanTier } from "../assets/queries";
import { usePlayer } from "../assets/AudioRow";
import { mmss } from "../projects/format";
import { uploadToAssets } from "./toolUpload";
import type { UploadFile } from "./upload";
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

/** Not enough AI credits for a tool: what it costs, what's left, and where to get more. */
type Shortfall = { cost: number; balance: number | null };

/**
 * Runs one AI tool job (POST /jobs, then polls it) the way every tab does:
 * progress while it works, the result saved in Assets → AI Assets, a refusal
 * for credits turned into the shortfall sheet. Resolves with the finished job,
 * or null when it didn't finish (already explained to the person).
 */
function useToolJob(cost: number) {
  const toast = useToast();
  const qc = useQueryClient();
  const ctx = useCreateContext();
  const [progress, setProgress] = useState<number | null>(null);
  const [shortfall, setShortfall] = useState<Shortfall | null>(null);

  const run = async (start: () => Promise<{ jobId: string }>): Promise<Job | null> => {
    if (ctx.data && ctx.data.aiCredits < cost) {
      setShortfall({ cost, balance: ctx.data.aiCredits });
      return null;
    }
    setProgress(0);
    try {
      const { jobId } = await start();
      const job = await jobs.waitFor(jobId, { intervalMs: pollMs.tool, onProgress: (j) => setProgress(j.progress) });
      if (job.status === "failed") {
        toast(job.error ?? "That didn’t work. Your credits were refunded.", "error");
        return null;
      }
      return job;
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) setShortfall({ cost, balance: ctx.data?.aiCredits ?? null });
      else toast(apiErrorMessage(e), "error");
      return null;
    } finally {
      setProgress(null);
      // Balances moved (charged, or refunded), and AI Assets has something new.
      void qc.invalidateQueries({ queryKey: createKeys.context });
      void qc.invalidateQueries({ queryKey: ["assets"] });
    }
  };
  const sheet = <ShortfallSheet shortfall={shortfall} onClose={() => setShortfall(null)} />;
  return { run, progress, busy: progress != null, sheet };
}

function ShortfallSheet({ shortfall, onClose }: { shortfall: Shortfall | null; onClose: () => void }) {
  return (
    <BottomSheet visible={!!shortfall} onClose={onClose} title="Not enough AI credits">
      {shortfall ? (
        <Text style={text.body}>
          This needs {shortfall.cost} AI credit{shortfall.cost === 1 ? "" : "s"}
          {shortfall.balance != null ? ` and you have ${shortfall.balance}` : ""}. Top up, or upgrade for more each month.
        </Text>
      ) : null}
      <Button label="Get AI credits" fullWidth onPress={() => (onClose(), router.push("/you/credits"))} />
      <Button label="Not now" variant="ghost" fullWidth onPress={onClose} />
    </BottomSheet>
  );
}

function Working({ progress, label }: { progress: number; label: string }) {
  return (
    <View style={styles.working} accessibilityLiveRegion="polite">
      <Text style={type(14, "semibold")}>{label}</Text>
      <ProgressBar value={progress} label={`${label} progress`} />
      <Text style={text.caption}>It’s saved to Assets when it’s done, so you can leave this screen.</Text>
    </View>
  );
}

function Results({ kind, title }: { kind: "image" | "audio"; title: string }) {
  const results = useRecentResults(kind);
  const qc = useQueryClient();
  const playing = usePlayer((s) => s.playing);
  const toggle = async (m: Asset) => {
    const key = createKeys.results(kind);
    qc.setQueryData<Asset[]>(key, (list) => list?.map((x) => (x.id === m.id ? { ...x, favorite: !m.favorite } : x)));
    try {
      await assets.update(m.id, { favorite: !m.favorite });
    } catch {
      void qc.invalidateQueries({ queryKey: key });
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
            <View key={m.id} style={styles.imageCard} accessible accessibilityLabel={`Generated image: ${m.name}`}>
              {m.thumbnailUrl ?? m.url ? <Image source={imageSource((m.thumbnailUrl ?? m.url)!)} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
              <Star on={m.favorite} onPress={() => void toggle(m)} />
            </View>
          ))}
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {results.data.slice(0, 5).map((m) => (
            <View key={m.id} style={styles.audioRow}>
              <Pressable
                onPress={() => usePlayer.getState().toggle(m)}
                accessibilityRole="button"
                accessibilityLabel={`${playing === m.id ? "Pause" : "Play"} ${m.name}`}
                style={styles.audioIcon}
              >
                <Icon name={playing === m.id ? "pause" : "play"} size={18} color={colors.emeraldBright} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={type(14, "medium")} numberOfLines={1}>
                  {m.name}
                </Text>
                {m.madeWith || m.durationSec ? (
                  <Text style={type(12, "regular", { color: colors.fgMuted })}>{[m.madeWith, m.durationSec ? mmss(m.durationSec) : null].filter(Boolean).join(" · ")}</Text>
                ) : null}
              </View>
              <Star on={m.favorite} onPress={() => void toggle(m)} inline />
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
  const voice = list.find((v) => v.id === voiceId) ?? list[0];
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

/** One per press: the server won't charge twice for a retried request. */
const newKey = () => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// ── Enhance speech / Vocal remover ────────────────────────────────────────

/** The file a tool runs on: picked on the phone (uploaded to Assets first) or already in Assets. */
type Source = { kind: "phone"; file: UploadFile & { durationSec: number } } | { kind: "asset"; asset: Asset & { durationSec: number } };

const lengthLabel = (sec: number) => (sec % 60 === 0 ? `${sec / 60} min` : `${sec} s`);

// The server takes the file from Assets (POST /jobs { type, assetId }), so a
// file from the phone is uploaded there first (decision 2026-10-10 A) — it
// stays in Assets, and a retry doesn't upload it again. The length is read on
// the phone so the price and the tool's length limit show before anything is
// charged; the server checks both again.
function AudioTab({ tool }: { tool: AudioToolId }) {
  const toast = useToast();
  const spec = AUDIO_TOOLS[tool];
  const storage = useAssetStorage();
  const plan = usePlanTier().data ?? "free";
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);
  const sec = source ? (source.kind === "phone" ? source.file.durationSec : source.asset.durationSec) : 0;
  const cost = source ? audioToolCredits(tool, sec) : 0;
  const job = useToolJob(cost);

  /** Problems with a file for this tool, in words; null when it's fine. */
  const problem = (sizeBytes: number, durationSec: number | null) => {
    if (sizeBytes > spec.maxBytes) return `That file is over the ${formatBytes(spec.maxBytes)} limit.`;
    if (durationSec == null) return "Couldn’t read how long that file is. Try another one.";
    if (durationSec > spec.maxSec) return `That file is ${mmss(durationSec)} long. ${spec.name} takes up to ${lengthLabel(spec.maxSec)}.`;
    return null;
  };

  const pickPhone = async () => {
    setChoosing(false);
    const res = await DocumentPicker.getDocumentAsync({ type: ["audio/*", "video/*"], copyToCacheDirectory: true });
    const f = res.canceled ? null : res.assets[0];
    if (!f) return;
    setSource(null);
    if ((f.size ?? 0) > spec.maxBytes) return setError(problem(f.size ?? 0, 0));
    setChecking(true);
    const durationSec = await probeDuration(f.uri);
    setChecking(false);
    const p = problem(f.size ?? 0, durationSec) ?? assetUploadProblem(f.size ?? 0, storage.data?.usedBytes ?? 0, plan);
    if (p) return setError(p);
    setError(null);
    setSource({ kind: "phone", file: { uri: f.uri, name: f.name, mimeType: f.mimeType ?? "application/octet-stream", sizeBytes: f.size ?? 0, durationSec: durationSec! } });
  };

  const pickAsset = async (a: Asset) => {
    setChoosing(false);
    setSource(null);
    let durationSec = a.durationSec;
    if (!durationSec && a.url) {
      setChecking(true);
      durationSec = await probeDuration(a.url);
      setChecking(false);
    }
    const p = problem(a.sizeBytes, durationSec);
    if (p) return setError(p);
    setError(null);
    setSource({ kind: "asset", asset: { ...a, durationSec: durationSec! } });
  };

  const run = async () => {
    if (!source) return;
    const done = await job.run(async () => {
      let assetId: string;
      if (source.kind === "phone") {
        setUploading(0);
        try {
          const asset = await uploadToAssets(source.file, setUploading);
          // Now it's in Assets: a retry runs on it without uploading again.
          setSource({ kind: "asset", asset: { ...asset, durationSec: source.file.durationSec } });
          assetId = asset.id;
        } finally {
          setUploading(null);
        }
      } else {
        assetId = source.asset.id;
      }
      return jobs.start({ type: tool === "enhance" ? "enhance-speech" : "vocal-remover", assetId, idempotencyKey: newKey() });
    });
    if (done) {
      toast(`${tool === "enhance" ? "Clean audio" : "Instrumental"} ready. Saved to Assets.`, "success");
      setSource(null);
    }
  };

  const name = source ? (source.kind === "phone" ? source.file.name : source.asset.name) : "";
  const size = source ? (source.kind === "phone" ? source.file.sizeBytes : source.asset.sizeBytes) : 0;
  const rate = tool === "enhance" ? "8 credits / min" : "1 credit / 30 s";
  return (
    <>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={text.caption}>{tool === "enhance" ? "Removes background noise and room echo from a voice recording." : "Splits the vocals out of a song and keeps the music."}</Text>
        {source ? (
          <View style={styles.voiceRow}>
            <View style={styles.audioIcon}>
              <Icon name={source.kind === "asset" ? "folder" : "file"} size={18} color={colors.emeraldBright} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type(14, "semibold")} numberOfLines={1}>
                {name}
              </Text>
              <Text style={type(12, "regular", { color: colors.fgMuted })}>
                {mmss(sec)} · {formatBytes(size)}
                {source.kind === "asset" ? " · in Assets" : ""}
              </Text>
            </View>
            <Button label="Change" variant="ghost" size="md" onPress={() => setChoosing(true)} disabled={job.busy} />
          </View>
        ) : (
          <Pressable
            onPress={() => setChoosing(true)}
            disabled={checking}
            accessibilityRole="button"
            accessibilityLabel={`Choose an audio or video file, up to ${formatBytes(spec.maxBytes)} and ${lengthLabel(spec.maxSec)}`}
            style={({ pressed }) => [styles.drop, pressed && { backgroundColor: colors.surface3 }]}
          >
            <View style={styles.dropIcon}>
              <Icon name="cloudUpload" size={22} color={colors.emeraldBright} />
            </View>
            <Text style={type(15, "bold")}>{checking ? "Reading the file…" : "Choose a file"}</Text>
            <Text style={[type(12, "regular", { color: colors.fgMuted }), { textAlign: "center" }]}>
              MP3, WAV, M4A, MP4, MOV… · up to {formatBytes(spec.maxBytes)}, {lengthLabel(spec.maxSec)}
            </Text>
          </Pressable>
        )}
        {error ? (
          <Text style={type(12, "medium", { color: colors.error })} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        {uploading != null ? <Working progress={Math.round(uploading * 100)} label="Uploading to Assets…" /> : job.progress != null ? <Working progress={job.progress} label={`${spec.name}…`} /> : null}
        <Text style={text.caption}>You get: {spec.output}</Text>
        <Results kind="audio" title="Latest audio" />
      </ScrollView>
      <ActionBar
        cost={source ? `${cost} credit${cost === 1 ? "" : "s"}` : rate}
        label={tool === "enhance" ? "Enhance speech" : "Remove vocals"}
        onPress={() => void run()}
        loading={job.busy}
        disabled={!source}
      />
      <SourceSheet visible={choosing} tool={tool} onClose={() => setChoosing(false)} onPhone={() => void pickPhone()} onAsset={(a) => void pickAsset(a)} />
      {job.sheet}
    </>
  );
}

function SourceSheet({ visible, tool, onClose, onPhone, onAsset }: { visible: boolean; tool: AudioToolId; onClose: () => void; onPhone: () => void; onAsset: (a: Asset) => void }) {
  const spec = AUDIO_TOOLS[tool];
  const list = useQuery({
    queryKey: ["assets", "audio-tool-sources"],
    queryFn: async () => {
      const [audio, video] = await Promise.all([assets.list({ kind: "audio" }), assets.list({ kind: "video" })]);
      return [...audio.assets, ...video.assets].filter((a) => a.status === "ready").sort((x, y) => y.createdAt.localeCompare(x.createdAt));
    },
    enabled: visible,
  });
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Choose a file">
      <Button label="From this phone" icon="upload" iconPosition="start" variant="secondary" fullWidth onPress={onPhone} />
      <Text style={text.label}>From Assets</Text>
      {list.isPending ? (
        <Skeleton height={56} rounded={16} />
      ) : list.isError ? (
        <Button label="Couldn’t load your files. Try again" variant="ghost" size="md" icon="refresh" iconPosition="start" onPress={() => void list.refetch()} />
      ) : list.data.length === 0 ? (
        <Text style={text.caption}>No audio or video in your Assets yet.</Text>
      ) : (
        <ScrollView style={{ maxHeight: 340 }}>
          <OptionList
            accessibilityLabel="Files in Assets"
            value={null}
            options={list.data.map((a) => {
              const tooLong = a.durationSec != null && a.durationSec > spec.maxSec;
              const tooBig = a.sizeBytes > spec.maxBytes;
              return {
                value: a.id,
                label: a.name,
                detail: tooBig ? `Over ${formatBytes(spec.maxBytes)}` : tooLong ? `Longer than ${lengthLabel(spec.maxSec)}` : [a.kind === "video" ? "Video" : "Audio", a.durationSec ? mmss(a.durationSec) : null, formatBytes(a.sizeBytes)].filter(Boolean).join(" · "),
                disabled: tooLong || tooBig,
              };
            })}
            onChange={(id) => {
              const a = list.data.find((x) => x.id === id);
              if (a) onAsset(a);
            }}
          />
        </ScrollView>
      )}
    </BottomSheet>
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
  voicePick: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  working: { gap: 10, padding: 14, borderRadius: radius.tile, backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.tintBorder },
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
