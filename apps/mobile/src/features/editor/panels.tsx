import {
  AI_TEXT_OPERATIONS,
  assetUploadProblem,
  type AiTextOperationId,
  ASPECT_DIMENSIONS,
  CAPTION_TEMPLATE_CATALOG,
  videoClipAt,
  type Asset,
  type AudioClip,
  type CaptionClip,
  type TextClip,
  type TextEntrancePreset,
  CAPTION_HIGHLIGHTS,
  CAPTION_POSITIONS,
  EDITOR_EFFECTS,
  EDITOR_FILTERS,
  EDITOR_FONTS,
  EDITOR_TRANSITIONS,
  TEXT_ANIMATIONS,
  TEXT_PRESETS,
  type EditorFont,
} from "@clipiro/shared";
import { useQuery } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { BottomSheet, Button, EmptyState, FilterPills, Icon, OptionList, ProgressBar, Skeleton, Slider, TextField, useToast, type IconName } from "@/components";
import { imageSource, sample, type SampleImage } from "@/lib/images";
import { assets as assetsApi, editorTools } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { useDebounced } from "@/lib/useDebounced";
import { colors, radius, text, type } from "@/theme";
import { COMING_SOON } from "../home/tools";
import { caps, highlightColor } from "../create/AutoClipSheets";
import { assetKeys, useAssetStorage, usePlanTier } from "../assets/queries";
import { useUploadQueue } from "../assets/uploadQueue";
import { BoxTabs, Badge, ChipChoice, Field } from "./bits";
import { PanelShell } from "./PanelShell";
import { GenerateCaptionsSheet, TranslateCaptionsSheet, textTarget } from "./captionSheets";
import { addText, captionPosition, insertAssets, newId, setClipVolume, setLook, setOriginalVolume, setTexts, styleCaptions, updateClip, type CaptionStyle } from "./docOps";
import { clock, durationOf, useEditor } from "./store";
import { probeDuration, withDurations } from "@/lib/probe";
import { placeWhenUploaded } from "./uploads";
import { VoiceoverSheet } from "./voiceoverSheet";

const mmss = (s: number) => clock(s, false);

// Colours written into the video itself (the doc stores #rrggbb), not UI colours.
const HIGHLIGHT_HEX: Record<string, string> = { emerald: "#20d68a", warning: "#f5a524", info: "#3b9eff", error: "#ef4444" };
const highlightHex = (name: string) => HIGHLIGHT_HEX[name] ?? "#20d68a";

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
] as const;
const STOCK_KINDS = [
  { value: "video", label: "Videos" },
  { value: "image", label: "Photos" },
] as const;

/** One tile in the grid: a file in Assets or a stock search result. */
type Tile = { id: string; title: string; kind: "video" | "image"; thumb: string | null; durationSec: number | null };

export function MediaPanel() {
  const toast = useToast();
  const playhead = useEditor((s) => s.playhead);
  const [tab, setTab] = useState<(typeof MEDIA_TABS)[number]["id"]>("assets");
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("all");
  const [stockKind, setStockKind] = useState<(typeof STOCK_KINDS)[number]["value"]>("video");
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim(), 400);
  const [picked, setPicked] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  const listOpts = { kind: kind === "all" ? null : kind } as const;
  const library = useQuery({ queryKey: assetKeys.list(listOpts), queryFn: () => assetsApi.list(listOpts), enabled: tab === "assets" });
  const stock = useQuery({ queryKey: ["editor", "stock", stockKind, q], queryFn: () => editorTools.stock(stockKind, q), enabled: tab === "stock" && q.length > 0 });
  const source = tab === "assets" ? library : stock;

  const libraryAssets = (library.data?.assets ?? []).filter((a): a is Asset & { kind: "video" | "image" } => a.kind !== "audio" && a.status === "ready");
  const tiles: Tile[] =
    tab === "assets"
      ? libraryAssets.map((a) => ({ id: a.id, title: a.name, kind: a.kind, thumb: a.thumbnailUrl ?? (a.kind === "image" ? (a.url ?? null) : null), durationSec: a.durationSec }))
      : (stock.data?.items ?? []).map((i) => ({ id: i.id, title: i.name, kind: stockKind, thumb: i.thumbUrl, durationSec: i.durationSec ?? null }));

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const switchTab = (t: (typeof MEDIA_TABS)[number]["id"]) => {
    setTab(t);
    setPicked([]);
  };

  // Picked files go in one after another from the playhead, in the order they were picked.
  const add = async () => {
    setAdding(true);
    try {
      let list: Asset[];
      if (tab === "assets") {
        list = picked.map((id) => libraryAssets.find((a) => a.id === id)).filter((a): a is Asset & { kind: "video" | "image" } => !!a);
      } else {
        // Stock results are copied into Assets first (the renderer reads files from there).
        list = [];
        for (const id of picked) {
          const item = stock.data?.items.find((i) => i.id === id);
          if (item) list.push(await editorTools.importStock({ type: stockKind, item }));
        }
      }
      list = await withDurations(list);
      const at = useEditor.getState().playhead;
      const r = insertAssets(useEditor.getState().doc, list, at);
      useEditor.getState().addMedia(list);
      useEditor.getState().edit(() => r.doc, r.selected);
      toast(`${list.length} item${list.length === 1 ? "" : "s"} added at ${mmss(at)}.`, "success");
      setPicked([]);
    } catch (e) {
      toast(apiErrorMessage(e), "error");
    } finally {
      setAdding(false);
    }
  };

  return (
    <PanelShell
      panel="media"
      footer={
        tab !== "upload" ? (
          <>
            <Text style={[type(12, "regular", { color: colors.fgMuted }), { flex: 1 }]}>
              {adding ? (tab === "stock" ? "Saving to Assets…" : "Adding…") : picked.length ? `${picked.length} selected · adds at ${mmss(playhead)}` : "Tap to select"}
            </Text>
            <EmeraldButton label="Add to timeline" icon="plus" disabled={!picked.length || adding} onPress={() => void add()} />
          </>
        ) : undefined
      }
    >
      <BoxTabs label="Media source" tabs={MEDIA_TABS} value={tab} onChange={switchTab} />
      {tab === "upload" ? (
        <UploadTab />
      ) : (
        <>
          {tab === "stock" ? (
            <>
              <TextField label="Search stock" hideLabel leadingIcon="search" value={query} onChangeText={setQuery} placeholder="Search free stock videos and photos" returnKeyType="search" autoCorrect={false} />
              <FilterPills accessibilityLabel="Stock type" options={STOCK_KINDS} value={stockKind} onChange={(k) => (setStockKind(k), setPicked([]))} />
            </>
          ) : (
            <FilterPills accessibilityLabel="Media type" options={KINDS} value={kind} onChange={(k) => (setKind(k), setPicked([]))} />
          )}
          {tab === "stock" && !q ? (
            <EmptyState icon="search" title="Search stock" body="Free videos and photos you can use in your edit." />
          ) : source.isPending ? (
            <View style={styles.grid}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.cell}>
                  <Skeleton height={110} rounded={12} />
                </View>
              ))}
            </View>
          ) : source.isError ? (
            <EmptyState tone="error" title="Couldn’t load media" body={apiErrorMessage(source.error)} action={{ label: "Try again", onPress: () => void source.refetch() }} />
          ) : tiles.length === 0 ? (
            <EmptyState icon={tab === "stock" ? "search" : "folder"} title={tab === "stock" ? "Nothing found" : "Nothing here yet"} body={tab === "stock" ? "Try another search." : "Upload videos or images to use them here."} />
          ) : (
            <View style={styles.grid}>
              {tiles.map((i) => (
                <MediaTile key={i.id} item={i} on={picked.includes(i.id)} order={picked.indexOf(i.id) + 1} onPress={() => toggle(i.id)} />
              ))}
            </View>
          )}
          {tab === "stock" ? <Text style={text.caption}>Stock from Pexels. Added files are saved to your Assets.</Text> : null}
        </>
      )}
    </PanelShell>
  );
}

/** Upload from the phone: into Assets (the Assets upload queue), then onto the timeline as each file lands. */
function UploadTab() {
  const toast = useToast();
  const queue = useUploadQueue();
  const storage = useAssetStorage();
  const plan = usePlanTier().data ?? "free";

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["video/*", "image/*", "audio/*"], copyToCacheDirectory: true, multiple: true });
    if (res.canceled) return;
    let room = (storage.data?.usedBytes ?? 0) + queue.items.filter((x) => x.status !== "done" && x.status !== "failed").reduce((t, x) => t + x.sizeBytes, 0);
    const ok = [];
    for (const f of res.assets) {
      const problem = assetUploadProblem(f.size ?? 0, room, plan);
      if (problem) {
        toast(`${f.name}: ${problem}`, "error");
        continue;
      }
      const mimeType = f.mimeType ?? "application/octet-stream";
      // Its length goes up with it, so the clip (and the Asset) has the right one.
      ok.push({ uri: f.uri, name: f.name, mimeType, sizeBytes: f.size ?? 0, durationSec: mimeType.startsWith("video/") || mimeType.startsWith("audio/") ? await probeDuration(f.uri) : null });
      room += f.size ?? 0;
    }
    const { projectId, playhead } = useEditor.getState();
    if (ok.length && projectId) placeWhenUploaded(queue.add(ok), projectId, playhead);
  };

  return (
    <>
      <Pressable onPress={() => void pick()} accessibilityRole="button" accessibilityLabel="Choose videos, images or audio from this phone" style={styles.drop}>
        <View style={styles.dropIcon}>
          <Icon name="cloudUpload" size={22} color={colors.emeraldBright} />
        </View>
        <Text style={type(15, "bold")}>Choose files</Text>
        <Text style={[text.caption, { textAlign: "center" }]}>Videos, images or audio. They’re saved to Assets and added at the playhead as each one finishes.</Text>
      </Pressable>
      {queue.items.map((x) => (
        <View key={x.id} style={{ gap: 6 }}>
          <View style={styles.fieldRow}>
            <Text style={[type(13, "semibold"), { flex: 1 }]} numberOfLines={1}>
              {x.name}
            </Text>
            <Text style={type(11, "regular", { mono: true, color: x.status === "failed" ? colors.error : colors.fgMuted })}>
              {x.status === "done" ? "Added" : x.status === "failed" ? "Failed" : x.status === "paused" ? "Paused" : x.status === "queued" ? "Waiting" : `${Math.round(x.progress * 100)}%`}
            </Text>
          </View>
          {x.status === "uploading" || x.status === "paused" ? <ProgressBar value={Math.round(x.progress * 100)} height={4} label={`${x.name} ${Math.round(x.progress * 100)}%`} /> : null}
          {x.error ? <Text style={text.caption}>{x.error}</Text> : null}
        </View>
      ))}
      {queue.items.some((x) => x.status === "paused" || x.status === "failed") ? <Button label="Retry" icon="refresh" iconPosition="start" variant="secondary" size="md" onPress={queue.retry} /> : null}
    </>
  );
}

function MediaTile({ item, on, order, onPress }: { item: Tile; on: boolean; order: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      aria-checked={on}
      accessibilityLabel={`${item.title}, ${item.kind}${item.durationSec ? `, ${mmss(item.durationSec)}` : ""}`}
      style={[styles.cell, styles.tile, on && styles.tileOn]}
    >
      {item.thumb ? (
        <Image source={imageSource(item.thumb)} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
          <Icon name={item.kind === "video" ? "film" : "image"} size={22} color={colors.fgSubtle} />
        </View>
      )}
      {item.durationSec ? <Text style={styles.duration}>{mmss(item.durationSec)}</Text> : null}
      {on ? (
        <View style={styles.check}>
          <Text style={type(11, "bold", { color: colors.bg })}>{order}</Text>
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

/** Caption size in the export's pixels (the frame's height). */
const pxFor = (pct: number, aspect: keyof typeof ASPECT_DIMENSIONS) => Math.round(pct * ASPECT_DIMENSIONS[aspect].h);

export function CaptionsPanel() {
  const doc = useEditor((s) => s.doc);
  const edit = useEditor((s) => s.edit);
  const cues = doc.tracks.caption;
  const first = cues[0];
  const [words, setWords] = useState(false);
  const [gen, setGen] = useState(false);
  const [translating, setTranslating] = useState(false);

  const style = (s: CaptionStyle) => edit((d) => styleCaptions(d, s));

  if (!first) {
    return (
      <PanelShell panel="captions">
        <EmptyState icon="captions" title="No captions yet" body="Generate them from the speech in your video, word by word." action={{ label: "Generate captions", onPress: () => setGen(true) }} />
        <GenerateCaptionsSheet visible={gen} onClose={() => setGen(false)} />
      </PanelShell>
    );
  }

  const px = pxFor(first.fontSizePct, doc.aspect);
  return (
    <PanelShell panel="captions">
      <View style={styles.styleStrip}>
        {CAPTION_TEMPLATE_CATALOG.slice(0, 6).map((t, i) => {
          const color = t.look.highlight ? highlightHex(t.look.highlight) : null;
          const on = (first.textTransform === "uppercase") === t.look.uppercase && (color ? first.highlightColor === color : first.highlightMode === "none");
          const photo: SampleImage = (["creator-smile", "founder-portrait", "creator-hat", "dj-neon", "creator-violet", "gym-lift"] as const)[i] ?? "creator-smile";
          return (
            <Pressable
              key={t.id}
              onPress={() => style({ textTransform: t.look.uppercase ? "uppercase" : "none", bold: true, ...(color ? { highlightColor: color, highlightMode: "word" } : { highlightMode: "none" }) })}
              accessibilityRole="radio"
              aria-checked={on}
              accessibilityLabel={`${t.name} caption style`}
              style={styles.styleItem}
            >
              <View style={[styles.styleThumb, on && styles.tileOn]}>
                <Image source={sample(photo)} style={[StyleSheet.absoluteFill, { opacity: 0.6 }]} contentFit="cover" />
                <Text style={type(10, "heavy")} maxFontSizeMultiplier={1}>
                  {caps("Watch", t.look.uppercase)}
                </Text>
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
        <ChipChoice label="Highlight" options={CAPTION_HIGHLIGHTS} value={first.highlightMode} onChange={(highlightMode) => style({ highlightMode })} />
      </Field>
      <Field label="Position">
        <BoxTabs label="Caption position" tabs={CAPTION_POSITIONS} value={first.positionPreset === "top" || first.positionPreset === "center" ? first.positionPreset : "bottom"} onChange={(p) => style(captionPosition(p))} />
      </Field>
      <Field label="Size" right={<Text style={type(13, "semibold", { mono: true })}>{px} px</Text>}>
        <Slider
          label="Caption size"
          value={px}
          min={24}
          max={160}
          step={2}
          onChange={(v) => style({ fontSizePct: v / ASPECT_DIMENSIONS[doc.aspect].h })}
          formatValue={(v) => `${v} pixels`}
        />
      </Field>
      <View style={styles.row}>
        <Button label="Translate" icon="globe" iconPosition="start" variant="secondary" size="md" onPress={() => setTranslating(true)} style={{ flex: 1 }} />
        <Button label="Edit words" icon="text" iconPosition="start" variant="secondary" size="md" onPress={() => setWords(true)} style={{ flex: 1 }} />
      </View>

      <Button label="Make captions again" icon="refresh" iconPosition="start" variant="ghost" size="md" onPress={() => setGen(true)} />
      <GenerateCaptionsSheet visible={gen} onClose={() => setGen(false)} />
      <TranslateCaptionsSheet visible={translating} onClose={() => setTranslating(false)} />

      <BottomSheet visible={words} onClose={() => setWords(false)} title="Edit words">
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
          {cues.map((c) => (
            <CueEditor key={c.id} cue={c} />
          ))}
        </ScrollView>
        <Button label="Done" variant="secondary" size="sm" fullWidth onPress={() => setWords(false)} />
      </BottomSheet>
    </PanelShell>
  );
}

/** One caption line. Saved when you leave the field; changing it drops its word timings. */
function CueEditor({ cue }: { cue: CaptionClip }) {
  const [value, setValue] = useState(cue.text);
  const commit = () => {
    const text = value.trim();
    if (text === cue.text) return;
    useEditor.getState().edit((d) => updateClip<CaptionClip>(d, "caption", cue.id, { text, words: undefined, highlightMode: "none" }));
  };
  return (
    <View style={{ gap: 4 }}>
      <Text style={type(11, "regular", { mono: true, color: colors.fgSubtle })}>{clock(cue.timelineStart, false)}</Text>
      <TextInput value={value} onChangeText={setValue} onEndEditing={commit} accessibilityLabel={`Caption at ${clock(cue.timelineStart, false)}`} selectionColor={colors.emeraldBright} style={styles.line} />
    </View>
  );
}

// ── Audio ─────────────────────────────────────────────────────────────────

export function AudioPanel() {
  const toast = useToast();
  const doc = useEditor((s) => s.doc);
  const media = useEditor((s) => s.media);
  const edit = useEditor((s) => s.edit);
  const [sheet, setSheet] = useState(false);
  const [voiceover, setVoiceover] = useState(false);
  const library = useQuery({ queryKey: ["editor", "audio-assets"], queryFn: () => assetsApi.list({ kind: "audio" }), enabled: sheet });
  const original = Math.round((doc.tracks.video[0]?.volume ?? 1) * 100);

  // A track from Assets goes under the whole edit from the playhead (or its own length).
  const addTrack = (a: Asset) => {
    const t = useEditor.getState().playhead;
    const length = Math.max(1, Math.min(a.durationSec ?? durationOf(doc), Math.max(durationOf(doc) - t, 1)));
    const clip: AudioClip = { id: newId(), type: "audio", assetId: a.id, timelineStart: t, duration: length, srcIn: 0, volume: 0.3 };
    useEditor.getState().addMedia([a]);
    edit((d) => ({ ...d, tracks: { ...d.tracks, audio: [...d.tracks.audio, clip] } }), { track: "audio", id: clip.id });
    setSheet(false);
    toast(`${a.name} added at ${mmss(t)}.`, "success");
  };

  return (
    <PanelShell panel="audio">
      {doc.tracks.video.length ? <Track icon="mic" title="Original sound" value={original} onChange={(v) => edit((d) => setOriginalVolume(d, v / 100))} /> : null}
      {doc.tracks.audio.map((c) => (
        <Track
          key={c.id}
          icon="music"
          title={media[c.assetId]?.name ?? "Audio"}
          value={Math.round(c.volume * 100)}
          onChange={(v) => edit((d) => setClipVolume(d, "audio", c.id, v / 100))}
          onRemove={() => edit((d) => ({ ...d, tracks: { ...d.tracks, audio: d.tracks.audio.filter((x) => x.id !== c.id) } }))}
        />
      ))}
      <View style={styles.row}>
        <ToolTile icon="waveform" title="Enhance speech" detail="8 credits / min" onPress={() => toast(COMING_SOON, "info")} />
        <ToolTile icon="music" title="Remove vocals" detail="1 credit / 30 s" onPress={() => toast(COMING_SOON, "info")} />
      </View>
      <View style={styles.row}>
        <Button label="Add music" icon="plus" iconPosition="start" variant="secondary" size="md" onPress={() => setSheet(true)} style={{ flex: 1 }} />
        <Button label="Voiceover" icon="mic" iconPosition="start" variant="secondary" size="md" onPress={() => setVoiceover(true)} style={{ flex: 1 }} />
      </View>
      <VoiceoverSheet visible={voiceover} onClose={() => setVoiceover(false)} />

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="Add audio from Assets">
        {library.isPending ? (
          <Skeleton height={56} rounded={16} />
        ) : library.isError ? (
          <Button label="Couldn’t load your audio. Try again" variant="ghost" size="md" icon="refresh" iconPosition="start" onPress={() => library.refetch()} />
        ) : library.data.assets.length === 0 ? (
          <Text style={text.caption}>No audio in your Assets yet. Upload music or a voice track there first.</Text>
        ) : (
          <View style={{ maxHeight: 380 }}>
            <OptionList
              accessibilityLabel="Audio"
              value={null}
              options={library.data.assets.map((a) => ({ value: a.id, label: a.name, detail: a.durationSec ? mmss(a.durationSec) : undefined }))}
              onChange={(id) => {
                const a = library.data.assets.find((x) => x.id === id);
                if (a) addTrack(a);
              }}
            />
          </View>
        )}
      </BottomSheet>
    </PanelShell>
  );
}

function Track({ icon, title, value, onChange, onRemove }: { icon: IconName; title: string; value: number; onChange: (v: number) => void; onRemove?: () => void }) {
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
          {onRemove ? (
            <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove ${title}`} hitSlop={10}>
              <Icon name="close" size={14} color={colors.fgMuted} />
            </Pressable>
          ) : null}
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
  { color: "#ffffff", name: "White" },
  { color: "#20d68a", name: "Emerald" },
  { color: "#c6f432", name: "Lime" },
  { color: "#f5a524", name: "Amber" },
  { color: "#3b9eff", name: "Blue" },
  { color: "#ef4444", name: "Red" },
] as const;

/** Preset sizes, as a share of the frame's height (the web's text presets). */
const PRESET_SIZE: Record<string, number> = { Heading: 0.08, Subheading: 0.055, "Body Text": 0.04, "Animated Text": 0.06, "Lower Third": 0.04, Caption: 0.035, Quote: 0.05 };

export function TextPanel() {
  const doc = useEditor((s) => s.doc);
  const selected = useEditor((s) => s.selected);
  const edit = useEditor((s) => s.edit);
  const current = selected?.track === "text" ? doc.tracks.text.find((t) => t.id === selected.id) ?? null : null;
  const [font, setFont] = useState<EditorFont>(current?.fontFamily ?? "Poppins");
  const [color, setColor] = useState<string>(current?.color ?? "#ffffff");
  const [animation, setAnimation] = useState(current?.entrance?.type ?? "pop");

  const patch = (p: Partial<TextClip>) => current && edit((d) => updateClip<TextClip>(d, "text", current.id, p));
  const add = (preset: (typeof TEXT_PRESETS)[number]) => {
    const r = addText(doc, useEditor.getState().playhead, {
      text: preset.sample,
      fontFamily: preset.font,
      fontSizePct: PRESET_SIZE[preset.label] ?? 0.05,
      color,
      bold: preset.label === "Heading" || preset.label === "Subheading" || preset.label === "Animated Text",
      align: "center",
      x: 0.5,
      y: 0.2,
      bgColor: null,
      entrance: animation === "none" ? null : { type: animation as TextEntrancePreset, duration: 0.4, delay: 0 },
    });
    edit(() => r.doc, r.selected);
  };

  return (
    <PanelShell panel="text">
      {current ? (
        <TextField label="Text on screen" value={current.text} onChangeText={(t) => patch({ text: t, richText: undefined })} maxLength={500} />
      ) : (
        <View style={styles.presetGrid}>
          {TEXT_PRESETS.map((p) => (
            <Pressable key={p.label} onPress={() => add(p)} accessibilityRole="button" accessibilityLabel={`Add ${p.label}`} style={({ pressed }) => [styles.preset, pressed && { backgroundColor: colors.surface3 }]}>
              <Text style={type(14, p.label === "Body Text" || p.label === "Caption" ? "medium" : "bold")} numberOfLines={1} adjustsFontSizeToFit>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <Field label="Font">
        <ChipChoice label="Font" options={EDITOR_FONTS.map((f) => ({ id: f, label: f }))} value={current?.fontFamily ?? font} onChange={(f) => (setFont(f), patch({ fontFamily: f }))} />
      </Field>
      <Field label="Color">
        <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Text colour">
          {SWATCHES.map((s) => {
            const on = s.color === (current?.color ?? color);
            return (
              <Pressable key={s.name} onPress={() => (setColor(s.color), patch({ color: s.color }))} accessibilityRole="radio" aria-checked={on} accessibilityLabel={s.name} style={[styles.swatchRing, on && { borderColor: colors.fg }]}>
                <View style={[styles.swatch, { backgroundColor: s.color }]} />
              </Pressable>
            );
          })}
        </View>
      </Field>
      <Field label="Animation">
        <ChipChoice
          label="Animation"
          options={TEXT_ANIMATIONS}
          value={current?.entrance?.type ?? animation}
          onChange={(a) => (setAnimation(a as TextEntrancePreset), patch({ entrance: a === "none" ? null : { type: a as TextEntrancePreset, duration: 0.4, delay: 0 } }))}
        />
      </Field>
      {current ? <Button label="Done" variant="secondary" size="sm" fullWidth onPress={() => useEditor.getState().select(null)} /> : null}
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
const LOOK_KEY = { effects: "effect", filters: "filter", transitions: "transitionOut" } as const;

export function EffectsPanel() {
  const toast = useToast();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<(typeof LOOK_TABS)[number]["id"]>(params.tab === "filters" || params.tab === "transitions" ? params.tab : "effects");
  const doc = useEditor((s) => s.doc);
  const selected = useEditor((s) => s.selected);
  const playhead = useEditor((s) => s.playhead);
  const edit = useEditor((s) => s.edit);
  // The look goes on the selected clip, else the one under the playhead.
  const target = (selected?.track === "video" ? doc.tracks.video.find((c) => c.id === selected.id) : null) ?? videoClipAt(doc, playhead) ?? doc.tracks.video[0] ?? null;

  const list = tab === "effects" ? EDITOR_EFFECTS : tab === "filters" ? EDITOR_FILTERS : EDITOR_TRANSITIONS;
  const key = LOOK_KEY[tab];
  const current = (target?.[key] as string | undefined) ?? "none";
  const apply = (id: string, to: "clip" | "all") => {
    if (!target) return toast("Add a video clip first.", "info");
    edit((d) => setLook(d, to === "all" ? "all" : [target.id], { [key]: id } as never));
    if (to === "all") toast("Applied to every clip.", "success");
  };

  return (
    <PanelShell
      panel="effects"
      footer={
        <>
          <Text style={[type(12, "regular", { color: colors.fgMuted }), { flex: 1 }]}>{target ? `On clip ${doc.tracks.video.indexOf(target) + 1} of ${doc.tracks.video.length}` : "No video yet"}</Text>
          <Button label="Apply to all" variant="secondary" size="md" disabled={!target} onPress={() => apply(current, "all")} />
        </>
      }
    >
      <BoxTabs label="Look" tabs={LOOK_TABS} value={tab} onChange={setTab} />
      <View style={styles.grid}>
        {list.map((o, i) => {
          const on = o.id === current;
          return (
            <Pressable key={o.id} onPress={() => apply(o.id, "clip")} accessibilityRole="radio" aria-checked={on} accessibilityLabel={o.label} style={styles.cell}>
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
      {tab !== "filters" ? <Text style={text.caption}>{tab === "effects" ? "Effects" : "Transitions"} show in the export; the preview here doesn’t animate them.</Text> : null}
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
  const doc = useEditor((s) => s.doc);
  const selected = useEditor((s) => s.selected);
  const [running, setRunning] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const target = textTarget(doc, selected);
  const empty = target.clips.length === 0;

  const run = async (id: string, label: string) => {
    if (id === "translate") return setTranslating(true);
    const t = textTarget(useEditor.getState().doc, useEditor.getState().selected);
    setRunning(id);
    try {
      const { texts } = await editorTools.aiText({ operation: id as AiTextOperationId, texts: t.clips.map((c) => c.text) });
      const changes = t.clips.map((c, i) => ({ id: c.id, text: texts[i] ?? c.text })).filter((c, i) => c.text !== t.clips[i]!.text);
      if (changes.length) useEditor.getState().edit((d) => setTexts(d, t.track, changes));
      toast(changes.length ? `${label}: done for ${t.label}.` : `${label}: nothing to change.`, changes.length ? "success" : "info");
    } catch (e) {
      toast(`${label}: ${apiErrorMessage(e)}`, "error");
    } finally {
      setRunning(null);
    }
  };
  return (
    <PanelShell panel="ai-tools">
      <Text style={text.label}>Captions & text</Text>
      <Text style={text.caption}>
        {empty ? "Add captions, or select a text, to use these." : `Works on ${target.label}${target.clips.length > 1 ? ` (${target.clips.length})` : ""}. Free, within a daily limit.`}
      </Text>
      {AI_TEXT_OPERATIONS.map((o) => (
        <Row key={o.id} icon={OP_ICONS[o.id] ?? "sparkle"} title={o.label} detail={o.instant ? "Instant" : "AI"}>
          <Button
            label={running === o.id ? "Running" : "Run"}
            variant="secondary"
            size="md"
            loading={running === o.id}
            disabled={empty || (!!running && running !== o.id)}
            accessibilityLabel={`${o.label} ${target.label}`}
            onPress={() => void run(o.id, o.label)}
          />
        </Row>
      ))}
      <TranslateCaptionsSheet visible={translating} onClose={() => setTranslating(false)} target={target} />
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
