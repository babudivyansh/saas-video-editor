import { ApiError, type TimelineDoc } from "@clipiro/shared";
import { useState } from "react";
import { Text, View } from "react-native";
import { BottomSheet, Button, OptionList, ProgressBar, useToast } from "@/components";
import { editorTools } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { text } from "@/theme";
import { CAPTION_LANGUAGES, captionMinutes, generateCaptions } from "./captionGen";
import { replaceCaptions, setTexts, type Selection } from "./docOps";
import { useEditor } from "./store";

// The Captions panel's two server-backed actions, as sheets: make captions
// from the speech (Clip Minutes), and translate them (free, daily limit).

export function GenerateCaptionsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const toast = useToast();
  const doc = useEditor((s) => s.doc);
  const media = useEditor((s) => s.media);
  const [language, setLanguage] = useState<string>("auto");
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const minutes = captionMinutes(doc, media);
  const replacing = doc.tracks.caption.length > 0;

  const run = async () => {
    setProgress({ done: 0, of: 1 });
    try {
      const cues = await generateCaptions(useEditor.getState().doc, language, (done, of) => setProgress({ done, of }));
      if (!cues.length) {
        toast("No speech found in this video.", "info");
      } else {
        useEditor.getState().edit((d) => replaceCaptions(d, cues));
        toast(`${cues.length} caption${cues.length === 1 ? "" : "s"} added.`, "success");
      }
      onClose();
    } catch (e) {
      toast(e instanceof ApiError && e.status === 402 ? e.message : apiErrorMessage(e), "error");
    } finally {
      setProgress(null);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={progress ? () => {} : onClose} title={replacing ? "Make captions again" : "Generate captions"}>
      {progress ? (
        <View style={{ gap: 10 }} accessibilityLiveRegion="polite">
          <Text style={text.caption}>{progress.of > 1 ? `Transcribing video ${Math.min(progress.done + 1, progress.of)} of ${progress.of}…` : "Transcribing…"}</Text>
          <ProgressBar value={progress.done} max={progress.of} label="Captions progress" />
        </View>
      ) : (
        <>
          <Text style={text.caption}>
            Uses {minutes} Clip Minute{minutes === 1 ? "" : "s"}: 1 per started minute of each video file.{replacing ? " Replaces the captions you have, keeping their look." : ""}
          </Text>
          <View style={{ maxHeight: 300 }}>
            <OptionList accessibilityLabel="Spoken language" value={language} options={CAPTION_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} onChange={setLanguage} />
          </View>
          <Button label={replacing ? "Make captions again" : "Generate captions"} fullWidth disabled={doc.tracks.video.length === 0} onPress={() => void run()} />
          {doc.tracks.video.length === 0 ? <Text style={text.caption}>Add a video first.</Text> : null}
        </>
      )}
    </BottomSheet>
  );
}

const TRANSLATE_TO = ["English", "Spanish", "Hindi", "Portuguese", "French", "German", "Arabic", "Japanese", "Italian", "Indonesian"];

/** What the AI text tools work on: the selected caption or text, else every caption. */
export type TextTarget = { track: "caption" | "text"; clips: { id: string; text: string }[]; label: string };

export function textTarget(doc: TimelineDoc, selected: Selection | null): TextTarget {
  if (selected?.track === "text" || selected?.track === "caption") {
    const clip = (selected.track === "text" ? doc.tracks.text : doc.tracks.caption).find((c) => c.id === selected.id);
    if (clip) return { track: selected.track, clips: [{ id: clip.id, text: clip.text }], label: selected.track === "text" ? "the selected text" : "the selected caption" };
  }
  return { track: "caption", clips: doc.tracks.caption.map((c) => ({ id: c.id, text: c.text })), label: "every caption" };
}

export function TranslateCaptionsSheet({ visible, onClose, target }: { visible: boolean; onClose: () => void; target?: TextTarget }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const translate = async (language: string) => {
    const t = target ?? textTarget(useEditor.getState().doc, null);
    setBusy(language);
    try {
      const { texts } = await editorTools.aiText({ operation: "translate", texts: t.clips.map((c) => c.text), targetLang: language });
      useEditor.getState().edit((d) => setTexts(d, t.track, t.clips.map((c, i) => ({ id: c.id, text: texts[i] ?? c.text }))));
      toast(`Translated ${t.label} to ${language}.`, "success");
      onClose();
    } catch (e) {
      toast(apiErrorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={busy ? () => {} : onClose} title={target?.track === "text" ? "Translate text" : "Translate captions"}>
      <Text style={text.caption}>
        Translates {target?.label ?? "every caption"}. Free, within a daily limit.{target?.track === "text" ? "" : " Word-by-word highlights stop for translated lines, since their timings no longer match."}
      </Text>
      <View style={{ maxHeight: 360 }}>
        <OptionList accessibilityLabel="Translate to" value={busy} options={TRANSLATE_TO.map((l) => ({ value: l, label: l, disabled: !!busy && busy !== l }))} onChange={(l) => void translate(l)} />
      </View>
    </BottomSheet>
  );
}
