import {
  AI_TEXT_OPERATIONS,
  CAPTION_HIGHLIGHTS,
  CAPTION_POSITIONS,
  EDITOR_EFFECTS,
  EDITOR_FILTERS,
  EDITOR_FONTS,
  EDITOR_TRANSITIONS,
  TEXT_ANIMATIONS,
  TEXT_PRESETS,
  TEXT_STYLES,
  type EditorFont,
} from "@clipiro/shared";
import { useQuery } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BottomSheet, Button, EmptyState, FilterPills, Icon, OptionList, Skeleton, Slider, TextField, useToast, type IconName } from "@/components";
import { imageSource, sample, type SampleImage } from "@/lib/images";
import { colors, radius, text, type } from "@/theme";
import { errorMessage } from "@mocks/core";
import { CAPTION_TEMPLATES } from "@mocks/create";
import { CAPTION_LINES, getMediaLibrary, getStockMusic, runAiText, searchStock, type MediaItem } from "@mocks/editor";
import { COMING_SOON } from "../home/tools";
import { caps, highlightColor } from "../create/AutoClipSheets";
import { useVoices } from "../create/queries";
import { BoxTabs, Badge, ChipChoice, Field } from "./bits";
import { PanelShell } from "./PanelShell";
import { clock, useEditor } from "./store";

const mmss = (s: number) => clock(s, false);

// ── Media ─────────────────────────────────────────────────────────────────

const MEDIA_TABS = [
  { id: "assets", label: "Assets" },
  { id: "upload", label: "Upload" },
  { id: "stock", label: "Stock" },
] as const;
const KINDS = [
  { value: "all", label: "All" },
  { value: "video", label: "Videos" },
  { value: "image", label: "Images" },
  { value: "gif", label: "GIFs" },
] as const;

export function MediaPanel() {
  const toast = useToast();
  const playhead = useEditor((s) => s.playhead);
  const [tab, setTab] = useState<(typeof MEDIA_TABS)[number]["id"]>("assets");
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("video");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const library = useQuery({ queryKey: ["editor", "media"], queryFn: getMediaLibrary, enabled: tab === "assets" });
  const stock = useQuery({ queryKey: ["editor", "stock", query], queryFn: () => searchStock(query), enabled: tab === "stock" });
  const source = tab === "assets" ? library : stock;
  const items = (source.data ?? []).filter((i) => kind === "all" || i.kind === kind);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const add = () => {
    toast(`${picked.length} item${picked.length === 1 ? "" : "s"} added at ${mmss(playhead)}.`, "success");
    setPicked([]);
  };
  const upload = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["video/*", "image/*", "audio/*"], copyToCacheDirectory: false, multiple: true });
    if (!res.canceled) toast(`${res.assets.length} file${res.assets.length === 1 ? "" : "s"} will upload to Assets.`, "success");
  };

  return (
    <PanelShell
      panel="media"
      footer={
        tab !== "upload" ? (
          <>
            <Text style={[type(12, "regular", { color: colors.fgMuted }), { flex: 1 }]}>
              {picked.length ? `${picked.length} selected · adds at ${mmss(playhead)}` : "Tap to select"}
            </Text>
            <EmeraldButton label="Add to timeline" icon="plus" disabled={!picked.length} onPress={add} />
          </>
        ) : undefined
      }
    >
      <BoxTabs label="Media source" tabs={MEDIA_TABS} value={tab} onChange={(t) => (setTab(t), setPicked([]))} />
      {tab === "upload" ? (
        <Pressable onPress={upload} accessibilityRole="button" accessibilityLabel="Choose videos, images or audio from this phone" style={styles.drop}>
          <View style={styles.dropIcon}>
            <Icon name="cloudUpload" size={22} color={colors.emeraldBright} />
          </View>
          <Text style={type(15, "bold")}>Choose files</Text>
          <Text style={[text.caption, { textAlign: "center" }]}>Videos, images or audio. They’re saved to Assets too.</Text>
        </Pressable>
      ) : (
        <>
          {tab === "stock" ? (
            <TextField label="Search stock" hideLabel leadingIcon="search" value={query} onChangeText={setQuery} placeholder="Search Pexels and Giphy" returnKeyType="search" autoCorrect={false} />
          ) : null}
          <FilterPills accessibilityLabel="Media type" options={KINDS} value={kind} onChange={setKind} />
          {source.isPending ? (
            <View style={styles.grid}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.cell}>
                  <Skeleton height={110} rounded={12} />
                </View>
              ))}
            </View>
          ) : source.isError ? (
            <EmptyState tone="error" title="Couldn’t load media" body={errorMessage(source.error)} action={{ label: "Try again", onPress: () => source.refetch() }} />
          ) : items.length === 0 ? (
            <EmptyState icon={tab === "stock" ? "search" : "folder"} title={tab === "stock" ? "Nothing found" : "Nothing here yet"} body={tab === "stock" ? "Try another search." : "Upload videos or images to use them here."} />
          ) : (
            <View style={styles.grid}>
              {items.map((i) => (
                <MediaTile key={i.id} item={i} on={picked.includes(i.id)} onPress={() => toggle(i.id)} />
              ))}
            </View>
          )}
          {tab === "stock" ? <Text style={text.caption}>Stock from Pexels and Giphy.</Text> : null}
        </>
      )}
    </PanelShell>
  );
}

function MediaTile({ item, on, onPress }: { item: MediaItem; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      aria-checked={on}
      accessibilityLabel={`${item.title}, ${item.kind}${item.durationSec ? `, ${mmss(item.durationSec)}` : ""}`}
      style={[styles.cell, styles.tile, on && styles.tileOn]}
    >
      <Image source={imageSource(item.thumbnailUrl)} style={StyleSheet.absoluteFill} contentFit="cover" />
      {item.durationSec ? <Text style={styles.duration}>{mmss(item.durationSec)}</Text> : null}
      {item.kind === "gif" ? <Text style={styles.duration}>GIF</Text> : null}
      {on ? (
        <View style={styles.check}>
          <Icon name="check" size={14} color={colors.bg} strokeWidth={2.6} />
        </View>
      ) : null}
    </Pressable>
  );
}

function EmeraldButton({ label, icon, onPress, disabled }: { label: string; icon?: IconName; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={!!disabled}
      style={({ pressed }) => [styles.emerald, disabled && { opacity: 0.45 }, pressed && { opacity: 0.85 }]}
    >
      {icon ? <Icon name={icon} size={16} color={colors.bg} strokeWidth={2.4} /> : null}
      <Text style={type(14, "semibold", { color: colors.bg })}>{label}</Text>
    </Pressable>
  );
}

// ── Captions ──────────────────────────────────────────────────────────────

const LANGUAGES = ["English", "Spanish", "Hindi", "Portuguese", "French", "German", "Arabic", "Japanese"];

export function CaptionsPanel() {
  const toast = useToast();
  const captions = useEditor((s) => s.doc.captions);
  const edit = useEditor((s) => s.edit);
  const set = (patch: Partial<typeof captions>) => edit((d) => ({ ...d, captions: { ...d.captions, ...patch } }));
  const [sheet, setSheet] = useState<"language" | "words" | null>(null);
  const [lines, setLines] = useState(CAPTION_LINES);

  return (
    <PanelShell panel="captions">
      <View style={styles.styleStrip}>
        {CAPTION_TEMPLATES.slice(0, 6).map((t, i) => {
          const on = t.id === captions.templateId;
          const photo: SampleImage = (["creator-smile", "founder-portrait", "creator-hat", "dj-neon", "creator-violet", "gym-lift"] as const)[i] ?? "creator-smile";
          return (
            <Pressable key={t.id} onPress={() => set({ templateId: t.id })} accessibilityRole="radio" aria-checked={on} accessibilityLabel={`${t.name} caption style`} style={styles.styleItem}>
              <View style={[styles.styleThumb, on && styles.tileOn]}>
                <Image source={sample(photo)} style={[StyleSheet.absoluteFill, { opacity: 0.6 }]} contentFit="cover" />
                <Text style={type(10, "heavy")} maxFontSizeMultiplier={1}>{caps("Watch", t.look.uppercase)}</Text>
                <Text maxFontSizeMultiplier={1} style={[type(10, "heavy"), t.look.highlight ? { backgroundColor: highlightColor(t.look.highlight), color: colors.bg, paddingHorizontal: 3, borderRadius: 3 } : null]}>
                  {caps("this", t.look.uppercase)}
                </Text>
              </View>
              <Text style={type(11, "regular", { color: on ? colors.fg : colors.fgMuted })} numberOfLines={1}>
                {t.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Field label="Highlight">
        <ChipChoice label="Highlight" options={CAPTION_HIGHLIGHTS} value={captions.highlight} onChange={(highlight) => set({ highlight })} />
      </Field>
      <Field label="Position">
        <BoxTabs label="Caption position" tabs={CAPTION_POSITIONS} value={captions.position} onChange={(position) => set({ position })} />
      </Field>
      <Field label="Size" right={<Text style={type(13, "semibold", { mono: true })}>{captions.sizePx} px</Text>}>
        <Slider label="Caption size" value={captions.sizePx} min={24} max={96} step={2} onChange={(sizePx) => set({ sizePx })} formatValue={(v) => `${v} pixels`} />
      </Field>
      <View style={styles.row}>
        <Button label={captions.language} icon="globe" iconPosition="start" variant="secondary" size="md" onPress={() => setSheet("language")} style={{ flex: 1 }} />
        <Button label="Edit words" icon="text" iconPosition="start" variant="secondary" size="md" onPress={() => setSheet("words")} style={{ flex: 1 }} />
      </View>

      <BottomSheet visible={sheet === "language"} onClose={() => setSheet(null)} title="Caption language">
        <Text style={text.caption}>Translates every caption. Free, within a daily limit.</Text>
        <View style={{ maxHeight: 380 }}>
          <OptionList
            accessibilityLabel="Caption language"
            value={captions.language}
            options={LANGUAGES.map((l) => ({ value: l, label: l }))}
            onChange={async (language) => {
              setSheet(null);
              if (language === captions.language) return;
              try {
                toast(await runAiText("translate", language), "success");
                set({ language });
              } catch (e) {
                toast(errorMessage(e), "error");
              }
            }}
          />
        </View>
      </BottomSheet>
      <BottomSheet visible={sheet === "words"} onClose={() => setSheet(null)} title="Edit words">
        {lines.map((l, i) => (
          <TextInput
            key={i}
            value={l}
            onChangeText={(v) => setLines((ls) => ls.map((x, j) => (j === i ? v : x)))}
            accessibilityLabel={`Caption line ${i + 1}`}
            selectionColor={colors.emeraldBright}
            style={styles.line}
          />
        ))}
        <Button label="Done" variant="secondary" size="sm" fullWidth onPress={() => setSheet(null)} />
      </BottomSheet>
    </PanelShell>
  );
}

// ── Audio ─────────────────────────────────────────────────────────────────

export function AudioPanel() {
  const toast = useToast();
  const audio = useEditor((s) => s.doc.audio);
  const edit = useEditor((s) => s.edit);
  const voices = useVoices();
  const [sheet, setSheet] = useState<"music" | "voice" | null>(null);
  const music = useQuery({ queryKey: ["editor", "music"], queryFn: getStockMusic, enabled: sheet === "music" });
  const [script, setScript] = useState("");

  const setAudio = (patch: Partial<typeof audio>) => edit((d) => ({ ...d, audio: { ...d.audio, ...patch } }));

  return (
    <PanelShell panel="audio">
      <Track icon="mic" title="Original voice" value={audio.original} onChange={(original) => setAudio({ original })} />
      {audio.music ? (
        <Track icon="music" title={`Music · ${audio.music.title}`} value={audio.music.volume} onChange={(volume) => setAudio({ music: audio.music && { ...audio.music, volume } })} />
      ) : null}
      {audio.voiceover ? (
        <Track icon="volume" title={`Voiceover · ${audio.voiceover.voice}`} value={audio.voiceover.volume} onChange={(volume) => setAudio({ voiceover: audio.voiceover && { ...audio.voiceover, volume } })} />
      ) : null}
      <View style={styles.row}>
        <ToolTile icon="waveform" title="Enhance speech" detail="8 credits / min" onPress={() => toast(COMING_SOON, "info")} />
        <ToolTile icon="music" title="Remove vocals" detail="1 credit / 30 s" onPress={() => toast(COMING_SOON, "info")} />
      </View>
      <View style={styles.row}>
        <Button label="Add music" icon="plus" iconPosition="start" variant="secondary" size="md" onPress={() => setSheet("music")} style={{ flex: 1 }} />
        <Button label="Voiceover" icon="mic" iconPosition="start" variant="secondary" size="md" onPress={() => setSheet("voice")} style={{ flex: 1 }} />
      </View>

      <BottomSheet visible={sheet === "music"} onClose={() => setSheet(null)} title="Add music">
        <Text style={text.caption}>Royalty-free tracks from Jamendo.</Text>
        {music.isPending ? (
          <Skeleton height={56} rounded={16} />
        ) : music.isError ? (
          <Button label="Couldn’t load music. Try again" variant="ghost" size="md" icon="refresh" iconPosition="start" onPress={() => music.refetch()} />
        ) : (
          <OptionList
            accessibilityLabel="Music"
            value={null}
            options={music.data.map((m) => ({ value: m.id, label: m.title, detail: `${m.artist} · ${m.mood} · ${mmss(m.durationSec)}` }))}
            onChange={(id) => {
              const track = music.data.find((m) => m.id === id);
              if (track) setAudio({ music: { title: track.title, volume: 30 } });
              setSheet(null);
            }}
          />
        )}
      </BottomSheet>
      <BottomSheet visible={sheet === "voice"} onClose={() => setSheet(null)} title="Voiceover">
        <TextInput
          value={script}
          onChangeText={setScript}
          placeholder="What should the voice say?"
          placeholderTextColor={colors.fgSubtle}
          accessibilityLabel="Voiceover script"
          multiline
          maxLength={2000}
          selectionColor={colors.emeraldBright}
          style={[styles.line, { minHeight: 96, textAlignVertical: "top" }]}
        />
        <Text style={text.caption}>Voice: {voices.data?.[0]?.name ?? "Brian"} · 1 credit per 500 characters</Text>
        <Button
          label="Add voiceover"
          variant="secondary"
          size="sm"
          fullWidth
          disabled={!script.trim()}
          onPress={() => {
            setAudio({ voiceover: { voice: voices.data?.[0]?.name ?? "Brian", volume: 85 } });
            setScript("");
            setSheet(null);
            toast("Voiceover added to the timeline.", "success");
          }}
        />
      </BottomSheet>
    </PanelShell>
  );
}

function Track({ icon, title, value, onChange }: { icon: IconName; title: string; value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.track}>
      <View style={styles.trackIcon}>
        <Icon name={icon} size={16} color={colors.emeraldBright} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.fieldRow}>
          <Text style={[type(13, "semibold"), { flex: 1 }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={type(11, "regular", { mono: true, color: colors.fgMuted })}>{value}%</Text>
        </View>
        <Slider label={`${title} volume`} value={value} onChange={onChange} step={5} formatValue={(v) => `${v} percent`} />
      </View>
    </View>
  );
}

function ToolTile({ icon, title, detail, onPress }: { icon: IconName; title: string; detail: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}, ${detail}. Coming soon`} style={({ pressed }) => [styles.toolTile, pressed && { backgroundColor: colors.surface3 }]}>
      <Icon name={icon} size={18} color={colors.emeraldBright} />
      <Text style={type(13, "semibold")}>{title}</Text>
      <Text style={type(11, "regular", { color: colors.fgMuted })}>{detail}</Text>
    </Pressable>
  );
}

// ── Text ──────────────────────────────────────────────────────────────────

const SWATCHES = [
  { color: colors.fg, name: "White" },
  { color: colors.emeraldBright, name: "Emerald" },
  { color: colors.primary, name: "Lime" },
  { color: colors.warning, name: "Amber" },
  { color: colors.info, name: "Blue" },
  { color: colors.error, name: "Red" },
];

export function TextPanel() {
  const edit = useEditor((s) => s.edit);
  const [font, setFont] = useState<EditorFont>("Poppins");
  const [color, setColor] = useState<string>(colors.fg);
  const [animation, setAnimation] = useState("pop");
  const [style, setStyle] = useState<string>(TEXT_STYLES[0]);

  const add = (preset: (typeof TEXT_PRESETS)[number]) =>
    edit((d) => ({ ...d, texts: [...d.texts, { id: `t${d.texts.length + 1}`, preset: preset.label, text: preset.sample, font, color, animation }].slice(-3) }));

  return (
    <PanelShell panel="text">
      <View style={styles.presetGrid}>
        {TEXT_PRESETS.map((p) => (
          <Pressable key={p.label} onPress={() => add(p)} accessibilityRole="button" accessibilityLabel={`Add ${p.label}`} style={({ pressed }) => [styles.preset, pressed && { backgroundColor: colors.surface3 }]}>
            <Text style={type(14, p.label === "Body Text" || p.label === "Caption" ? "medium" : "bold")} numberOfLines={1} adjustsFontSizeToFit>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Field label="Style">
        <ChipChoice label="Text style" options={TEXT_STYLES.map((s) => ({ id: s, label: s }))} value={style} onChange={setStyle} />
      </Field>
      <Field label="Font">
        <ChipChoice label="Font" options={EDITOR_FONTS.map((f) => ({ id: f, label: f }))} value={font} onChange={setFont} />
      </Field>
      <Field label="Color">
        <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Text colour">
          {SWATCHES.map((s) => {
            const on = s.color === color;
            return (
              <Pressable key={s.name} onPress={() => setColor(s.color)} accessibilityRole="radio" aria-checked={on} accessibilityLabel={s.name} style={[styles.swatchRing, on && { borderColor: colors.fg }]}>
                <View style={[styles.swatch, { backgroundColor: s.color }]} />
              </Pressable>
            );
          })}
        </View>
      </Field>
      <Field label="Animation">
        <ChipChoice label="Animation" options={TEXT_ANIMATIONS} value={animation} onChange={setAnimation} />
      </Field>
    </PanelShell>
  );
}

// ── Effects · Filters · Transitions ───────────────────────────────────────

const LOOK_TABS = [
  { id: "effects", label: "Effects" },
  { id: "filters", label: "Filters" },
  { id: "transitions", label: "Transitions" },
] as const;
const LOOK_PHOTOS: SampleImage[] = ["creator-smile", "dj-neon", "gym-lift", "travel-summit", "founder-portrait", "creator-golden", "clapper", "creator-violet", "studio-mic", "keynote-stage"];

export function EffectsPanel() {
  const toast = useToast();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<(typeof LOOK_TABS)[number]["id"]>(params.tab === "filters" || params.tab === "transitions" ? params.tab : "effects");
  const look = useEditor((s) => s.doc.look);
  const edit = useEditor((s) => s.edit);
  const setLook = (patch: Partial<typeof look>) => edit((d) => ({ ...d, look: { ...d.look, ...patch } }));

  const list = tab === "effects" ? EDITOR_EFFECTS : tab === "filters" ? EDITOR_FILTERS : EDITOR_TRANSITIONS;
  const key = tab === "effects" ? "effect" : tab === "filters" ? "filter" : "transition";
  const current = look[key];

  return (
    <PanelShell
      panel="effects"
      footer={
        tab !== "filters" ? (
          <>
            <Button label="Apply to clip" variant="secondary" size="md" onPress={() => toast("Applied to this clip.", "success")} style={{ flex: 1 }} />
            <Button label="Apply to all" variant="secondary" size="md" onPress={() => toast("Applied to every clip.", "success")} style={{ flex: 1 }} />
          </>
        ) : undefined
      }
    >
      <BoxTabs label="Look" tabs={LOOK_TABS} value={tab} onChange={setTab} />
      <View style={styles.grid}>
        {list.map((o, i) => {
          const on = o.id === current;
          return (
            <Pressable key={o.id} onPress={() => setLook({ [key]: o.id })} accessibilityRole="radio" aria-checked={on} accessibilityLabel={o.label} style={styles.cell}>
              <View style={[styles.lookThumb, on && styles.tileOn]}>
                <Image source={sample(LOOK_PHOTOS[i % LOOK_PHOTOS.length] ?? "creator-smile")} style={StyleSheet.absoluteFill} contentFit="cover" />
              </View>
              <Text style={[type(12, on ? "semibold" : "regular", { color: on ? colors.fg : colors.fgMuted }), { textAlign: "center" }]} numberOfLines={2}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {tab === "effects" && look.effect !== "none" ? (
        <Field label="Intensity" right={<Text style={type(13, "semibold", { mono: true })}>{look.effectIntensity}%</Text>}>
          <Slider label="Effect intensity" value={look.effectIntensity} step={5} onChange={(effectIntensity) => setLook({ effectIntensity })} formatValue={(v) => `${v} percent`} />
        </Field>
      ) : null}
    </PanelShell>
  );
}

// ── AI Tools ──────────────────────────────────────────────────────────────

const OP_ICONS: Record<string, IconName> = {
  rewrite: "magic",
  grammar: "check",
  readability: "text",
  shorten: "scissors",
  expand: "plus",
  viral: "bolt",
  translate: "globe",
  emojis: "sparkle",
  lineBreaks: "captions",
  fillerWords: "scissors",
};

const CLIP_TOOLS: { title: string; detail: string; icon: IconName; pro: boolean }[] = [
  { title: "Dub into other languages", detail: "Keeps your voice", icon: "globe", pro: true },
  { title: "Remove subtitles", detail: "Erase burned-in text", icon: "captions", pro: true },
  { title: "Voice changer", detail: "Change the voice of a clip", icon: "mic", pro: false },
];

export function AiToolsPanel() {
  const toast = useToast();
  const [running, setRunning] = useState<string | null>(null);
  const run = async (id: string, label: string) => {
    setRunning(id);
    try {
      toast(await runAiText(id), "success");
    } catch (e) {
      toast(`${label}: ${errorMessage(e)}`, "error");
    } finally {
      setRunning(null);
    }
  };
  return (
    <PanelShell panel="ai-tools">
      <Text style={text.label}>Captions & text</Text>
      <Text style={text.caption}>Works on every caption at once. Free, within a daily limit.</Text>
      {AI_TEXT_OPERATIONS.map((o) => (
        <Row key={o.id} icon={OP_ICONS[o.id] ?? "sparkle"} title={o.label} detail={o.instant ? "Instant" : "AI"}>
          <Button label={running === o.id ? "Running" : "Run"} variant="secondary" size="md" loading={running === o.id} disabled={!!running && running !== o.id} onPress={() => run(o.id, o.label)} />
        </Row>
      ))}
      <View style={{ height: 8 }} />
      <Text style={text.label}>Clip tools</Text>
      {CLIP_TOOLS.map((t) => (
        <Row key={t.title} icon={t.icon} title={t.title} detail={t.detail} badge={t.pro ? "PRO" : undefined}>
          <Button label="Soon" variant="ghost" size="md" onPress={() => toast(COMING_SOON, "info")} accessibilityHint="Coming soon" />
        </Row>
      ))}
    </PanelShell>
  );
}

function Row({ icon, title, detail, badge, children }: { icon: IconName; title: string; detail: string; badge?: string; children: React.ReactNode }) {
  return (
    <View style={styles.aiRow}>
      <View style={styles.trackIcon}>
        <Icon name={icon} size={16} color={colors.emeraldBright} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.titleRow}>
          <Text style={type(14, "semibold")}>{title}</Text>
          {badge ? <Badge label={badge} /> : null}
        </View>
        <Text style={type(12, "regular", { color: colors.fgMuted })}>{detail}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cell: { width: "31%", gap: 6 },
  tile: { height: 110, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surface3, borderWidth: 2, borderColor: "transparent" },
  tileOn: { borderColor: colors.emeraldBright, borderWidth: 2 },
  duration: { position: "absolute", left: 6, bottom: 6, ...type(11, "regular", { mono: true }), textShadowColor: colors.bg, textShadowRadius: 4 },
  check: { position: "absolute", right: 6, top: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.emeraldBright, alignItems: "center", justifyContent: "center" },
  emerald: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: colors.emeraldBright },
  drop: { alignItems: "center", gap: 8, padding: 24, borderRadius: radius.card, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.tintBorder },
  dropIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.tint, alignItems: "center", justifyContent: "center" },
  styleStrip: { flexDirection: "row", gap: 8 },
  styleItem: { flex: 1, gap: 4, alignItems: "center" },
  styleThumb: { width: "100%", aspectRatio: 0.8, borderRadius: 10, overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent", backgroundColor: colors.surface3 },
  line: { ...type(15), minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.field, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.lineStrong },
  track: { flexDirection: "row", alignItems: "center", gap: 12 },
  trackIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.tint, alignItems: "center", justifyContent: "center" },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  toolTile: { flex: 1, gap: 6, padding: 12, borderRadius: radius.tile, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.line },
  presetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  preset: {
    width: "48%",
    minHeight: 56,
    borderRadius: radius.tile,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  swatches: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  swatchRing: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
  swatch: { width: 34, height: 34, borderRadius: 17 },
  lookThumb: { height: 96, borderRadius: 12, overflow: "hidden", borderWidth: 2, borderColor: "transparent", backgroundColor: colors.surface3 },
  aiRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
});
