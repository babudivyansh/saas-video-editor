import {
  ApiError,
  AUTOCLIP_FILE_TYPES,
  AUTOCLIP_LIMITS,
  CAPTION_TEMPLATE_CATALOG,
  CLIP_LENGTHS,
  MAX_CLIPS_PER_RUN,
  NetworkError,
  PLAN_LABEL,
  autoClipMinutes,
  formatBytes,
  formatHours,
  overflowCreditsFor,
  uploadProblem,
  type AutoClipSource,
} from "@clipiro/shared";
import { useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useEffectEvent, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheet, Button, CreditsPill, EmptyState, Header, Icon, IconButton, OptionList, ProgressBar, SkeletonCard, StatusBarScrim, Stepper, useToast } from "@/components";
import { jobs } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { registerForPush } from "@/lib/push";
import { sample } from "@/lib/images";
import { colors, layout, radius, text, type } from "@/theme";
import { AdvancedSheet, AssetSheet, CaptionSheet, ClipLengthSheet, LinkSheet, RatioSheet, caps, highlightColor } from "./AutoClipSheets";
import { useAutoClipDraft } from "./draft";
import { autoClipKeys, useAutoClipContext } from "./queries";
import { useAutoClipUpload, type AutoClipRefusal, type UploadState } from "./uploadStore";

type Sheet = "pick" | "link" | "assets" | "length" | "ratio" | "captions" | "advanced" | null;
type Mime = (typeof AUTOCLIP_FILE_TYPES)[number];

const MIME_BY_EXT: Record<string, Mime> = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm" };
const mimeOf = (name: string, given?: string | null) => given || MIME_BY_EXT[name.split(".").pop()?.toLowerCase() ?? ""] || "";


/** A run the server refused for minutes, as the sheet shows it; `retry` re-sends it paying the gap in credits. */
type Shortfall = AutoClipRefusal & { retry: (() => Promise<void>) | null };

type PickedFile = { uri: string; name: string; sizeBytes: number; mimeType: string; durationSec: number | null; width?: number; height?: number };

// design/screens/BN-Create.html — set up an AutoClip run. "Generate" uploads
// the picked file first (src/features/create/uploadStore.ts), then starts the
// run on the server; a run the user can't afford is offered with the gap paid
// in AI credits, as the web does.
export function AutoClipScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const ctx = useAutoClipContext();
  const { start } = useLocalSearchParams<{ start?: "upload" | "link" | "assets" }>();
  const { source, settings, setSource, update } = useAutoClipDraft();
  const upload = useAutoClipUpload();
  // "Start from" on the Create hub lands here with ?start=link|assets|upload.
  const [sheet, setSheet] = useState<Sheet>(() => (start === "link" || start === "assets" ? start : start === "upload" ? "pick" : null));
  const [fileError, setFileError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [shortfall, setShortfall] = useState<Shortfall | null>(null);

  const plan = ctx.data?.plan ?? "free";
  const limits = AUTOCLIP_LIMITS[plan];

  useEffect(() => {
    void useAutoClipUpload.getState().hydrate();
  }, []);

  const choose = (f: PickedFile) => {
    const problem = uploadProblem(f, plan);
    setFileError(problem);
    if (problem) return;
    setSource({ kind: "upload", fileName: f.name, sizeBytes: f.sizeBytes, mimeType: f.mimeType as Mime, durationSec: f.durationSec, uri: f.uri, width: f.width, height: f.height });
  };

  // Gallery: Android's photo picker (no permission needed) knows the length.
  const pickGallery = async () => {
    setSheet(null);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], allowsMultipleSelection: false, quality: 1 });
    const a = res.canceled ? null : res.assets[0];
    if (!a) return;
    const name = a.fileName ?? a.uri.split("/").pop() ?? "video.mp4";
    choose({
      uri: a.uri,
      name,
      sizeBytes: a.fileSize ?? new File(a.uri).size ?? 0,
      mimeType: mimeOf(name, a.mimeType),
      durationSec: a.duration ? a.duration / 1000 : null,
      width: a.width || undefined,
      height: a.height || undefined,
    });
  };

  // Files: anything the system file picker reaches. Copied into the app's
  // cache so the upload can read it in parts; the server measures its length.
  const pickFile = async () => {
    setSheet(null);
    const res = await DocumentPicker.getDocumentAsync({ type: [...AUTOCLIP_FILE_TYPES], copyToCacheDirectory: true, multiple: false });
    const f = res.canceled ? null : res.assets[0];
    if (!f) return;
    choose({ uri: f.uri, name: f.name, sizeBytes: f.size ?? 0, mimeType: mimeOf(f.name, f.mimeType), durationSec: null });
  };

  const minutes = source?.durationSec ? autoClipMinutes(source.durationSec) : null;
  const short = !!ctx.data && minutes != null && minutes > ctx.data.clipMinutes;

  const started = (jobId: string) => {
    toast("AutoClip started. We’ll let you know when your clips are ready.", "success");
    useAutoClipDraft.getState().reset();
    void qc.invalidateQueries({ queryKey: autoClipKeys.context });
    router.push(`/create/run/${jobId}` as Href);
    // The moment a push is worth asking for.
    void registerForPush({ ask: true });
  };

  /** Starts a run from a video the server can already reach (Assets or a link). */
  const startRun = async (s: Exclude<AutoClipSource, { kind: "upload" }>, allowCreditOverflow: boolean): Promise<void> => {
    setStarting(true);
    try {
      const { jobId } = await jobs.start({
        type: "autoclip",
        source: s.kind === "asset" ? { kind: "asset", assetId: s.assetId } : { kind: "link", url: s.url },
        settings,
        allowCreditOverflow,
      });
      setShortfall(null);
      started(jobId);
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        setShortfall({
          message: e.message,
          required: e.body.required ?? null,
          balance: e.body.balance ?? null,
          overflowCredits: e.body.overflowCredits ?? null,
          retry: allowCreditOverflow ? null : () => startRun(s, true),
        });
      } else toast(e instanceof ApiError || e instanceof NetworkError ? e.message : "Couldn’t start AutoClip. Try again.", "error");
    } finally {
      setStarting(false);
    }
  };

  const generate = async (allowCreditOverflow = false): Promise<void> => {
    if (!source || !ctx.data) return;
    // Known to be short before anything is sent: say so now, not after an upload.
    if (short && !allowCreditOverflow) {
      return setShortfall({
        message: `This video needs ${minutes} Clip Minutes and you have ${ctx.data.clipMinutes}.`,
        required: minutes,
        balance: ctx.data.clipMinutes,
        overflowCredits: overflowCreditsFor(minutes! - ctx.data.clipMinutes),
        retry: () => generate(true),
      });
    }
    setShortfall(null);
    if (source.kind !== "upload") return startRun(source, allowCreditOverflow);
    if (!source.uri) return setFileError("Pick the video again");
    await upload.upload(
      { uri: source.uri, name: source.fileName, mimeType: source.mimeType, sizeBytes: source.sizeBytes, durationSec: source.durationSec, width: source.width, height: source.height },
      { settings, allowCreditOverflow },
    );
  };

  // The upload store finishes on its own (even after a resume, or with this
  // screen closed and reopened): act on how it ended, then hand it back idle.
  const onUpload = useEffectEvent((u: UploadState) => {
    if (u.status === "started" && u.jobId) {
      u.clear();
      started(u.jobId);
    } else if (u.status === "short" && u.asset && u.refusal) {
      // The video is in Assets now: carry on from there, whatever is decided.
      const assetSource = { kind: "asset" as const, assetId: u.asset.id, title: u.asset.name, durationSec: u.asset.durationSec ?? 1 };
      const refusal = u.refusal;
      u.clear();
      setSource(assetSource);
      setShortfall({ ...refusal, retry: () => startRun(assetSource, true) });
    } else if (u.status === "failed" && u.error) {
      const error = u.error;
      u.clear();
      toast(error, "error");
    }
  });
  useEffect(() => {
    // One that finished while this screen was closed (e.g. resumed on return to the app).
    queueMicrotask(() => onUpload(useAutoClipUpload.getState()));
    return useAutoClipUpload.subscribe(onUpload);
  }, []);

  const busy = starting || upload.status === "uploading" || upload.status === "starting";
  const length = CLIP_LENGTHS.find((l) => l.id === settings.clipLength) ?? CLIP_LENGTHS[1];
  const caption = CAPTION_TEMPLATE_CATALOG.find((c) => c.id === settings.captionTemplateId) ?? null;
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
          <EmptyState tone="error" title="Couldn’t load AutoClip" body={apiErrorMessage(ctx.error)} action={{ label: "Try again", onPress: () => ctx.refetch() }} />
        ) : (
          <>
            {upload.status === "uploading" || upload.status === "paused" || upload.status === "starting" ? (
              <UploadCard
                fileName={upload.fileName ?? "Video"}
                progress={upload.progress}
                status={upload.status}
                note={upload.status === "paused" ? upload.error : null}
                onResume={() => void upload.resume()}
                onCancel={() => void upload.cancel()}
              />
            ) : source ? (
              <SourceCard source={source} onChange={() => setSource(null)} />
            ) : (
              <View style={styles.row}>
                <Pressable
                  onPress={() => setSheet("pick")}
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
                    body={ctx.data.videoAssets.length ? `${ctx.data.videoAssets.length} video${ctx.data.videoAssets.length === 1 ? "" : "s"}` : "No videos yet"}
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
            label="Generate clips"
            onPress={() => generate()}
            loading={busy}
            disabled={!source || busy}
            style={{ flex: 1 }}
            accessibilityHint={!source ? "Choose a video first" : short ? `You have ${ctx.data.clipMinutes} Clip Minutes` : undefined}
          />
        </View>
      ) : null}
      <StatusBarScrim />

      <BottomSheet visible={sheet === "pick"} onClose={() => setSheet(null)} title="Upload video">
        <OptionList
          accessibilityLabel="Where's the video?"
          value={null}
          onChange={(v) => void (v === "gallery" ? pickGallery() : pickFile())}
          options={[
            { value: "gallery", label: "Gallery", detail: "Videos on this phone" },
            { value: "files", label: "Files", detail: "Downloads, Drive and other apps" },
          ]}
        />
      </BottomSheet>
      <ShortfallSheet shortfall={shortfall} busy={busy} onClose={() => setShortfall(null)} />
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

/** The upload under way (or paused), in place of the source card. */
function UploadCard({
  fileName,
  progress,
  status,
  note,
  onResume,
  onCancel,
}: {
  fileName: string;
  progress: number;
  status: "uploading" | "paused" | "starting";
  note: string | null;
  onResume: () => void;
  onCancel: () => void;
}) {
  const pct = Math.round(progress * 100);
  const line = status === "starting" ? "Uploaded. Starting AutoClip…" : status === "paused" ? `Paused at ${pct}%` : `Uploading… ${pct}%`;
  return (
    <View style={[styles.card, styles.uploadCard]} accessibilityLiveRegion="polite">
      <View style={styles.sourceRow}>
        <View style={styles.sourceThumb}>
          <Icon name="cloudUpload" size={22} color={colors.emeraldBright} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={type(14, "semibold")} numberOfLines={1}>
            {fileName}
          </Text>
          <Text style={type(12, "regular", { color: status === "paused" ? colors.warning : colors.fgMuted })}>{line}</Text>
        </View>
        {status !== "starting" ? <IconButton icon="close" accessibilityLabel="Cancel upload" onPress={onCancel} /> : null}
      </View>
      <ProgressBar value={pct} label={`Upload ${pct}% done`} color={status === "paused" ? colors.warning : colors.emeraldBright} />
      {status === "paused" ? (
        <>
          {note ? <Text style={type(12, "regular", { color: colors.fgMuted })}>{note}</Text> : null}
          <Button label="Resume upload" variant="secondary" size="sm" fullWidth onPress={onResume} />
        </>
      ) : (
        <Text style={type(11, "regular", { color: colors.fgSubtle })}>Keep Clipiro open until it’s done. If it stops, it picks up where it left off.</Text>
      )}
    </View>
  );
}

/** Not enough Clip Minutes: pay the gap in AI credits (as the web offers), or get more minutes. */
function ShortfallSheet({ shortfall, busy, onClose }: { shortfall: Shortfall | null; busy: boolean; onClose: () => void }) {
  const credits = shortfall?.overflowCredits ?? null;
  return (
    <BottomSheet visible={!!shortfall} onClose={onClose} title="Not enough Clip Minutes">
      <Text style={text.caption}>{shortfall?.message}</Text>
      <View style={{ gap: 8 }}>
        {shortfall?.retry && credits ? (
          <Button
            label={`Use ${credits} AI credit${credits === 1 ? "" : "s"} for the rest`}
            size="sm"
            fullWidth
            loading={busy}
            onPress={() => void shortfall.retry?.()}
          />
        ) : null}
        <Button
          label="See your balance"
          variant="secondary"
          size="sm"
          fullWidth
          onPress={() => {
            onClose();
            router.push("/you/credits");
          }}
        />
      </View>
    </BottomSheet>
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
  uploadCard: { padding: 12, gap: 10 },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  sourceThumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: colors.tint, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  bar: { position: "absolute", left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.bg },
});
