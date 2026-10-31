import { VOICEOVER_MAX_CHARS, voiceoverCredits } from "@clipiro/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { BottomSheet, Button, OptionList, ProgressBar, Skeleton, useToast } from "@/components";
import { assets, editorTools, jobs } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { pollMs } from "@/lib/poll";
import { colors, radius, text, type } from "@/theme";
import { insertMedia } from "./docOps";
import { clock, useEditor } from "./store";

// Voiceover: pick a voice, write the script, and the server reads it (POST
// /jobs { type: "voiceover" }, the web's own tool and price: 1 credit per 300
// characters, the same for every voice). The result is saved in Assets
// (Phase 5.5) and laid on the audio track at the playhead.

export function VoiceoverSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const toast = useToast();
  const voices = useQuery({ queryKey: ["voices"], queryFn: editorTools.voices, enabled: visible, staleTime: 60 * 60 * 1000 });
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [script, setScript] = useState("");
  const [progress, setProgress] = useState<number | null>(null);

  const list = voices.data?.voices ?? [];
  const voice = list.find((v) => v.id === voiceId) ?? list.find((v) => !v.id.startsWith("clone:")) ?? list[0] ?? null;
  const credits = voiceoverCredits(script.trim().length);

  const make = async () => {
    if (!voice) return;
    setProgress(0);
    try {
      const { jobId } = await jobs.start({ type: "voiceover", text: script.trim(), voiceId: voice.id, title: `Voiceover · ${voice.name}` });
      const job = await jobs.waitFor(jobId, { intervalMs: pollMs.tool, onProgress: (j) => setProgress(j.progress) });
      if (job.status === "failed" || !job.result?.assetId) throw new Error(job.error ?? "The voiceover didn’t finish. Your credits were refunded.");
      const asset = await assets.get(job.result.assetId);
      const at = useEditor.getState().playhead;
      useEditor.getState().addMedia([asset]);
      const r = insertMedia(useEditor.getState().doc, { id: asset.id, kind: "audio", durationSec: asset.durationSec }, at);
      useEditor.getState().edit(() => r.doc, r.selected);
      toast(`Voiceover added at ${clock(at, false)}.`, "success");
      setScript("");
      onClose();
    } catch (e) {
      toast(e instanceof Error && !(e as { status?: number }).status ? e.message : apiErrorMessage(e), "error");
    } finally {
      setProgress(null);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={progress != null ? () => {} : onClose} title="Voiceover">
      {progress != null ? (
        <View style={{ gap: 10 }} accessibilityLiveRegion="polite">
          <Text style={text.caption}>Recording with {voice?.name}…</Text>
          <ProgressBar value={progress} label="Voiceover progress" />
        </View>
      ) : (
        <>
          <TextInput
            value={script}
            onChangeText={setScript}
            placeholder="What should the voice say?"
            placeholderTextColor={colors.fgSubtle}
            accessibilityLabel="Voiceover script"
            multiline
            maxLength={VOICEOVER_MAX_CHARS}
            selectionColor={colors.emeraldBright}
            style={styles.script}
          />
          {voices.isPending ? (
            <Skeleton height={56} rounded={16} />
          ) : voices.isError || !voices.data?.configured || list.length === 0 ? (
            <Text style={text.caption}>Voiceover isn’t available right now. Try again later.</Text>
          ) : (
            <View style={{ maxHeight: 220 }}>
              <OptionList
                accessibilityLabel="Voice"
                value={voice?.id ?? null}
                options={list.map((v) => ({ value: v.id, label: v.name, detail: [v.description, v.accent].filter(Boolean).join(" · ") || undefined }))}
                onChange={setVoiceId}
              />
            </View>
          )}
          <Text style={type(12, "regular", { color: colors.fgMuted })}>
            {script.trim() ? `${credits} AI credit${credits === 1 ? "" : "s"} · ` : ""}1 credit per 300 characters
          </Text>
          <Button label="Add voiceover" fullWidth disabled={!script.trim() || !voice} onPress={() => void make()} />
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  script: { ...type(15), minHeight: 96, textAlignVertical: "top", paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.field, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.lineStrong },
});
