import {
  CLIP_LENGTHS,
  MAX_INSTRUCTIONS_CHARS,
  sourceLinkSchema,
  formatHours,
  type AspectRatio,
  type AutoClipSettings,
  type AutoClipSource,
  type CaptionTemplate,
} from "@clipiro/shared";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { BottomSheet, Button, FilterPills, Icon, OptionList, SegmentedControl, Stepper, TextField, Toggle } from "@/components";
import { imageSource } from "@/lib/images";
import { colors, radius, text, type } from "@/theme";
import { errorMessage } from "@mocks/core";
import { CAPTION_TEMPLATES, probeLink, type CreateContext } from "@mocks/create";
import { useAutoClipDraft } from "./draft";

// The sheets behind AutoClip's tiles. None are drawn in the designs; they're
// composed from the system (BottomSheet, OptionList, Toggle, Stepper).

/** Caption highlight swatch → token colour. */
export function highlightColor(name: string): string {
  return ({ emerald: colors.emeraldBright, warning: colors.warning, info: colors.info, error: colors.error } as Record<string, string>)[name] ?? colors.emeraldBright;
}

/**
 * Upper-cases in JS: Android measures text *before* textTransform, so an
 * uppercase word in a heavy weight gets clipped ("WATC").
 */
export const caps = (word: string, upper: boolean) => (upper ? word.toUpperCase() : word);

/** Scrollable body for long sheets, capped so the sheet never covers the whole screen. */
function SheetBody({ children }: { children: React.ReactNode }) {
  const { height } = useWindowDimensions();
  return (
    <ScrollView style={{ maxHeight: height * 0.7 }} contentContainerStyle={{ gap: 16, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function LinkSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (s: AutoClipSource) => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string>();
  const [checking, setChecking] = useState(false);

  const submit = async () => {
    const parsed = sourceLinkSchema.safeParse(url);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    setError(undefined);
    setChecking(true);
    try {
      const info = await probeLink(parsed.data);
      onPick({ kind: "link", url: parsed.data, title: info.title, durationSec: info.durationSec });
      setUrl("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setChecking(false);
    }
  };

  const close = () => {
    setUrl("");
    setError(undefined);
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={close} title="Paste a link">
      <TextField
        label="Video link"
        leadingIcon="link"
        value={url}
        onChangeText={(t) => {
          setUrl(t);
          setError(undefined);
        }}
        placeholder="https://youtube.com/watch?v=…"
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        returnKeyType="go"
        onSubmitEditing={submit}
        error={error}
        helper="YouTube, Vimeo, Loom, Google Drive or Dropbox. Live streams can't be clipped."
      />
      <Button label="Use this link" variant="secondary" size="sm" fullWidth loading={checking} onPress={submit} />
    </BottomSheet>
  );
}

export function AssetSheet({
  visible,
  assets,
  onClose,
  onPick,
}: {
  visible: boolean;
  assets: CreateContext["videoAssets"];
  onClose: () => void;
  onPick: (a: CreateContext["videoAssets"][number]) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="From Assets">
      {assets.length === 0 ? (
        <Text style={[text.caption, { paddingVertical: 16 }]}>No videos in your Assets yet. Upload one, or paste a link.</Text>
      ) : (
        <SheetBody>
          {assets.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => onPick(a)}
              accessibilityRole="button"
              accessibilityLabel={`${a.title}, ${formatHours(a.durationSec)}`}
              style={({ pressed }) => [styles.assetRow, pressed && { backgroundColor: colors.surface3 }]}
            >
              <Image source={imageSource(a.thumbnailUrl)} style={styles.assetThumb} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <Text style={type(14, "semibold")} numberOfLines={1}>
                  {a.title}
                </Text>
                <Text style={type(12, "regular", { color: colors.fgMuted })}>{formatHours(a.durationSec)}</Text>
              </View>
              <Icon name="chevronRight" size={18} color={colors.fgMuted} />
            </Pressable>
          ))}
        </SheetBody>
      )}
    </BottomSheet>
  );
}

export function ClipLengthSheet({
  visible,
  value,
  onClose,
  onChange,
}: {
  visible: boolean;
  value: AutoClipSettings["clipLength"];
  onClose: () => void;
  onChange: (v: AutoClipSettings["clipLength"]) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Clip length">
      <OptionList
        accessibilityLabel="Clip length"
        value={value}
        onChange={(v) => {
          onChange(v);
          onClose();
        }}
        options={CLIP_LENGTHS.map((l) => ({ value: l.id, label: l.label, detail: `${l.min}–${l.max} seconds each` }))}
      />
    </BottomSheet>
  );
}

const RATIOS: { value: AspectRatio; label: string; detail: string }[] = [
  { value: "9:16", label: "9:16", detail: "Vertical, for Shorts and Reels" },
  { value: "1:1", label: "1:1", detail: "Square, for feeds" },
  { value: "16:9", label: "16:9", detail: "Widescreen, for YouTube" },
];

export function RatioSheet({ visible, value, onClose, onChange }: { visible: boolean; value: AspectRatio; onClose: () => void; onChange: (v: AspectRatio) => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Ratio">
      <OptionList
        accessibilityLabel="Ratio"
        value={value}
        onChange={(v) => {
          onChange(v);
          onClose();
        }}
        options={RATIOS}
      />
    </BottomSheet>
  );
}

export function CaptionSheet({
  visible,
  value,
  onClose,
  onChange,
}: {
  visible: boolean;
  value: string | null;
  onClose: () => void;
  onChange: (v: string | null) => void;
}) {
  const [lastOn, setLastOn] = useState(value ?? "clean");
  const on = value !== null;
  const rows: CaptionTemplate[][] = [];
  for (let i = 0; i < CAPTION_TEMPLATES.length; i += 2) rows.push(CAPTION_TEMPLATES.slice(i, i + 2));
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Captions">
      <View style={styles.toggleRow}>
        <Text style={[type(15, "semibold"), { flex: 1 }]}>Add captions</Text>
        <Toggle accessibilityLabel="Add captions" value={on} onValueChange={(next) => onChange(next ? lastOn : null)} />
      </View>
      {on ? (
        <SheetBody>
          <Text style={text.caption}>Premium styles render for extra AI credits.</Text>
          {rows.map((row) => (
            <View key={row.map((r) => r.id).join()} style={styles.styleRow}>
              {row.map((t) => {
                const sel = t.id === value;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => {
                      setLastOn(t.id);
                      onChange(t.id);
                    }}
                    accessibilityRole="radio"
                    aria-checked={sel}
                    accessibilityLabel={`${t.name}${t.premium ? ", premium" : ""}`}
                    style={[styles.styleCard, sel && styles.styleOn]}
                  >
                    <View style={styles.styleSample}>
                      <Text style={styles.sampleWord}>{caps("Watch", t.look.uppercase)}</Text>
                      <Text
                        style={[
                          styles.sampleWord,
                          t.look.highlight ? { backgroundColor: highlightColor(t.look.highlight), color: colors.bg, paddingHorizontal: 4, borderRadius: 4 } : null,
                        ]}
                      >
                        {caps("this", t.look.uppercase)}
                      </Text>
                    </View>
                    <View style={styles.styleFoot}>
                      <Text style={[type(13, "semibold"), { flex: 1 }]} numberOfLines={1}>
                        {t.name}
                      </Text>
                      {t.premium ? <Text style={type(10, "bold", { color: colors.warning, tracking: 0.04 })}>PREMIUM</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
              {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
            </View>
          ))}
        </SheetBody>
      ) : (
        <Text style={[text.caption, { paddingVertical: 8 }]}>Clips will have no captions. You can add them later in the editor.</Text>
      )}
    </BottomSheet>
  );
}

const MOTION = [
  { value: "balanced", label: "Balanced" },
  { value: "minimal", label: "Minimal" },
  { value: "dynamic", label: "Dynamic" },
  { value: "cinematic", label: "Cinematic" },
] as const;
const ZOOM = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;
const SPEAKER = [
  { value: "auto", label: "Auto" },
  { value: "single", label: "Single" },
  { value: "split", label: "Split" },
  { value: "active", label: "Active" },
] as const;

export function AdvancedSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { settings: s, update, resetAdvanced } = useAutoClipDraft();
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Advanced">
      <SheetBody>
        <Group title="Framing">
          <ToggleRow label="Smart auto reframe" detail="Keeps the speaker in frame" value={s.smartAutoReframe} onChange={(smartAutoReframe) => update({ smartAutoReframe })} />
          <Field label="Camera motion">
            <FilterPills accessibilityLabel="Camera motion" options={MOTION} value={s.reframingPreset} onChange={(reframingPreset) => update({ reframingPreset })} />
          </Field>
          <Field label="Zoom strength">
            <SegmentedControl accessibilityLabel="Zoom strength" options={ZOOM} value={s.zoomStrength} onChange={(zoomStrength) => update({ zoomStrength })} />
          </Field>
          <Field label="Speaker mode">
            <FilterPills accessibilityLabel="Speaker mode" options={SPEAKER} value={s.speakerMode} onChange={(speakerMode) => update({ speakerMode })} />
          </Field>
          <Field label="Smoothness">
            <Stepper size="md" label="Smoothness" value={s.smoothness} min={0} max={100} step={5} onChange={(smoothness) => update({ smoothness })} />
          </Field>
          <Field label="Tracking speed">
            <Stepper size="md" label="Tracking speed" value={s.trackingSpeed} min={0} max={100} step={5} onChange={(trackingSpeed) => update({ trackingSpeed })} />
          </Field>
        </Group>
        <Group title="Cuts">
          <ToggleRow label="Remove silences" value={s.removeSilence} onChange={(removeSilence) => update({ removeSilence })} />
          {s.removeSilence ? (
            <Field label="Silence longer than">
              <Stepper
                size="md"
                label="Silence threshold"
                value={s.silenceThresholdMs}
                min={200}
                max={1000}
                step={50}
                format={(v) => `${v} ms`}
                onChange={(silenceThresholdMs) => update({ silenceThresholdMs })}
              />
            </Field>
          ) : null}
          <ToggleRow label="Remove filler words" detail="“um”, “uh”, “like”…" value={s.removeFillers} onChange={(removeFillers) => update({ removeFillers })} />
        </Group>
        <Group title="Instructions">
          <View style={styles.textareaWrap}>
            <TextInput
              value={s.instructions}
              onChangeText={(instructions) => update({ instructions })}
              placeholder="e.g. Focus on the funding story; skip the intro"
              placeholderTextColor={colors.fgSubtle}
              selectionColor={colors.emeraldBright}
              cursorColor={colors.emeraldBright}
              accessibilityLabel="Instructions for the AI"
              multiline
              maxLength={MAX_INSTRUCTIONS_CHARS}
              style={styles.textarea}
            />
          </View>
          <Text style={[text.caption, { textAlign: "right" }]}>
            {s.instructions.length} / {MAX_INSTRUCTIONS_CHARS}
          </Text>
        </Group>
        <Button label="Reset to defaults" variant="ghost" size="md" icon="refresh" iconPosition="start" onPress={resetAdvanced} />
      </SheetBody>
    </BottomSheet>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={text.label} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={type(13, "medium", { color: colors.fgMuted })}>{label}</Text>
      {children}
    </View>
  );
}

function ToggleRow({ label, detail, value, onChange }: { label: string; detail?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={type(15, "medium")}>{label}</Text>
        {detail ? <Text style={type(12, "regular", { color: colors.fgMuted })}>{detail}</Text> : null}
      </View>
      <Toggle accessibilityLabel={label} value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  assetRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, padding: 8, borderRadius: radius.tile, backgroundColor: colors.surface1 },
  assetThumb: { width: 48, height: 48, borderRadius: 10 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  styleRow: { flexDirection: "row", gap: 10 },
  styleCard: { flex: 1, borderRadius: radius.tile, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  styleOn: { borderColor: colors.emeraldBright },
  styleSample: { height: 72, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4, backgroundColor: colors.surface3 },
  sampleWord: type(15, "heavy"),
  styleFoot: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, minHeight: 44 },
  textareaWrap: { borderRadius: radius.tile, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.lineStrong },
  textarea: { ...type(15, "regular", { lineHeight: 1.5 }), minHeight: 96, padding: 14, textAlignVertical: "top" },
});
