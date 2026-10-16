import { FILE_TOOLS, fileToolCredits, planAtLeast, type FileToolId } from "@clipiro/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheet, CreditsPill, EmptyState, Header, Icon, OptionList, Slider, StatusBarScrim, Toggle, useToast } from "@/components";
import { jobs } from "@/lib/api";
import { colors, radius, text, type } from "@/theme";
import { usePlayer } from "../assets/AudioRow";
import { useCreateContext, useVoices } from "./queries";
import { ActionBar, FileCard, newKey, PlanGate, Results, useFileInput, useToolJob, Working } from "./toolKit";

// The web's file-in, file-out AI tools (decision 2026-10-10 A): Voice
// changer, Background remover, Face swap, Subtitle remover. Each takes files
// from the phone (put in Assets first) or from Assets, shows its price before
// running, and saves what it makes to AI Assets. Face swap and Subtitle
// remover are Pro and up, as on the web. /create/tool/<id>.

const INTRO: Record<FileToolId, string> = {
  "voice-changer": "Re-speaks a recording in another voice, keeping the timing and emotion.",
  "background-remover": "Cuts the subject out of a photo and makes the background see-through.",
  "face-swap": "Puts a face from one photo onto the person in another.",
  "subtitle-remover": "Finds captions burned into a video and paints them out.",
};
const DONE: Record<FileToolId, string> = {
  "voice-changer": "New voice ready. Saved to Assets.",
  "background-remover": "Background removed. Saved to Assets.",
  "face-swap": "Face swapped. Saved to Assets.",
  "subtitle-remover": "Captions removed. Saved to Assets.",
};
const RESULT_KIND = { "voice-changer": "audio", "background-remover": "image", "face-swap": "image", "subtitle-remover": "video" } as const;

export function ToolScreen() {
  const insets = useSafeAreaInsets();
  const { tool } = useLocalSearchParams<{ tool: string }>();
  const ctx = useCreateContext();
  const id = tool && tool in FILE_TOOLS ? (tool as FileToolId) : null;

  return (
    <View style={styles.root}>
      <View style={[styles.head, { paddingTop: insets.top + 16 }]}>
        <Header
          title={id ? FILE_TOOLS[id].name : "Tool"}
          onBack={() => (router.canGoBack() ? router.back() : router.replace("/create"))}
          actions={ctx.data ? <CreditsPill kind="credits" amount={ctx.data.aiCredits} onPress={() => router.push("/you/credits")} /> : null}
        />
      </View>
      {id ? <ToolBody key={id} tool={id} /> : <EmptyState icon="sparkle" title="This tool isn’t in the app" body="Find it on clipiro.com." action={{ label: "Back to Create", onPress: () => router.replace("/create") }} />}
      <StatusBarScrim />
    </View>
  );
}

function ToolBody({ tool }: { tool: FileToolId }) {
  const toast = useToast();
  const spec = FILE_TOOLS[tool];
  const fileSpec = { name: spec.name, accepts: [spec.accepts] as const, maxBytes: spec.maxBytes, maxSec: spec.maxSec };
  const ctx = useCreateContext();
  const locked = !!ctx.data && !planAtLeast(ctx.data.plan, spec.minPlan);
  const input = useFileInput(fileSpec);
  // Face swap's second photo: the person the face goes onto.
  const target = useFileInput(fileSpec);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [removeNoise, setRemoveNoise] = useState(false);
  const [speed, setSpeed] = useState(100);
  // Face swap: the person confirms they may use both faces (the server requires it).
  const [consent, setConsent] = useState(false);

  const ready = !!input.source && (tool !== "face-swap" || (!!target.source && consent));
  const cost = input.source ? fileToolCredits(tool, input.source.durationSec ?? 0) : fileToolCredits(tool, 0);
  const job = useToolJob(cost);
  const voices = useVoices();
  const voiceList = voices.data?.voices ?? [];
  const voice = voiceList.find((v) => v.id === voiceId) ?? voiceList.find((v) => !v.id.startsWith("clone:")) ?? voiceList[0];

  const start = async () => {
    const key = newKey();
    switch (tool) {
      case "voice-changer":
        if (!voice) throw new Error("Choose a voice first.");
        return jobs.start({ type: "voice-changer", assetId: await input.assetId(), voiceId: voice.id, removeNoise, speed: speed / 100, idempotencyKey: key });
      case "face-swap":
        return jobs.start({ type: "face-swap", faceAssetId: await input.assetId(), targetAssetId: await target.assetId(), consent: true, idempotencyKey: key });
      default:
        return jobs.start({ type: tool, assetId: await input.assetId(), idempotencyKey: key });
    }
  };

  const run = async () => {
    const done = await job.run(start);
    if (done) {
      toast(DONE[tool], "success");
      input.clear();
      target.clear();
    }
  };

  const uploading = input.uploading ?? target.uploading;
  const price = tool === "voice-changer" ? "8 credits / min" : tool === "subtitle-remover" ? "From 2 credits" : `${cost} credit${cost === 1 ? "" : "s"}`;
  return (
    <>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={text.caption}>{INTRO[tool]}</Text>
        {locked ? <PlanGate name={spec.name} minPlan={spec.minPlan} /> : null}
        <FileCard input={input} spec={fileSpec} label={tool === "face-swap" ? "Face" : undefined} disabled={job.busy} />
        {tool === "face-swap" ? <FileCard input={target} spec={fileSpec} label="Photo to put it on" disabled={job.busy} /> : null}
        {tool === "face-swap" ? (
          <View style={styles.optionRow}>
            <Text style={[type(13, "regular", { color: colors.fgMuted }), { flex: 1 }]}>
              I have permission to use the faces in both photos, and I won’t use the result to deceive or impersonate anyone.
            </Text>
            <Toggle value={consent} onValueChange={setConsent} accessibilityLabel="I have permission to use both faces" />
          </View>
        ) : null}
        {tool === "voice-changer" ? (
          <VoiceOptions voiceId={voice?.id ?? null} onVoice={setVoiceId} removeNoise={removeNoise} onRemoveNoise={setRemoveNoise} speed={speed} onSpeed={setSpeed} />
        ) : null}
        {uploading != null ? <Working progress={Math.round(uploading * 100)} label="Uploading to Assets…" /> : job.progress != null ? <Working progress={job.progress} label={`${spec.name}…`} /> : null}
        <Text style={text.caption}>You get: {spec.output}</Text>
        <Results kind={RESULT_KIND[tool]} source={tool} title="Latest results" empty={`What ${spec.name} makes shows up here, and in Assets.`} />
      </ScrollView>
      <ActionBar cost={ready ? `${cost} credit${cost === 1 ? "" : "s"}` : price} label={spec.name} onPress={() => void run()} loading={job.busy} disabled={!ready || locked || (tool === "voice-changer" && !voice)} />
      {job.sheet}
    </>
  );
}

function VoiceOptions(p: { voiceId: string | null; onVoice: (id: string) => void; removeNoise: boolean; onRemoveNoise: (v: boolean) => void; speed: number; onSpeed: (v: number) => void }) {
  const voices = useVoices();
  const playing = usePlayer((s) => s.playing);
  const [picking, setPicking] = useState(false);
  const list = voices.data?.voices ?? [];
  const voice = list.find((v) => v.id === p.voiceId);
  return (
    <View style={{ gap: 12 }}>
      <Text style={text.label}>New voice</Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => voice?.previewUrl && usePlayer.getState().toggle({ id: `voice:${voice.id}`, url: voice.previewUrl })}
          disabled={!voice?.previewUrl}
          accessibilityRole="button"
          accessibilityLabel={voice ? `${playing === `voice:${voice.id}` ? "Stop" : "Play"} a sample of ${voice.name}` : "Loading voices"}
          style={styles.icon}
        >
          <Icon name={voice && playing === `voice:${voice.id}` ? "pause" : voice?.previewUrl ? "play" : "mic"} size={18} color={colors.emeraldBright} />
        </Pressable>
        <Pressable onPress={() => setPicking(true)} disabled={!list.length} accessibilityRole="button" accessibilityLabel={voice ? `Voice: ${voice.name}. Change` : "Choose a voice"} style={styles.pick}>
          <View style={{ flex: 1 }}>
            <Text style={type(15, "semibold")}>{voice?.name ?? (voices.isError ? "Voices aren’t available right now" : "Loading voices…")}</Text>
            {voice ? <Text style={type(12, "regular", { color: colors.fgMuted })}>{[voice.description, voice.accent].filter(Boolean).join(" · ")}</Text> : null}
          </View>
          <Icon name="chevronRight" size={18} color={colors.fgMuted} />
        </Pressable>
      </View>
      <View style={styles.optionRow}>
        <Text style={[type(14, "medium"), { flex: 1 }]}>Remove background noise</Text>
        <Toggle value={p.removeNoise} onValueChange={p.onRemoveNoise} accessibilityLabel="Remove background noise" />
      </View>
      <View style={{ gap: 4 }}>
        <View style={styles.optionHead}>
          <Text style={[type(14, "medium"), { flex: 1 }]}>Speed</Text>
          <Text style={type(12, "regular", { mono: true, color: colors.fgMuted })}>{(p.speed / 100).toFixed(2)}×</Text>
        </View>
        <Slider label="Speed" value={p.speed} onChange={p.onSpeed} min={70} max={120} step={5} formatValue={(v) => `${(v / 100).toFixed(2)} times`} />
      </View>
      <BottomSheet visible={picking} onClose={() => setPicking(false)} title="New voice">
        <ScrollView style={{ maxHeight: 420 }}>
          <OptionList
            accessibilityLabel="Voice"
            value={voice?.id ?? null}
            options={list.map((v) => ({ value: v.id, label: v.name, detail: [v.description, v.accent].filter(Boolean).join(" · ") || undefined }))}
            onChange={(v) => {
              p.onVoice(v);
              setPicking(false);
            }}
          />
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: 16, gap: 8 },
  body: { padding: 16, gap: 16, paddingBottom: 140 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, minHeight: 60, borderRadius: radius.tile, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.tint, alignItems: "center", justifyContent: "center" },
  pick: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 },
  optionHead: { flexDirection: "row", alignItems: "center" },
});
