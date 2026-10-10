import { ApiError, PLAN_LABEL, assetUploadProblem, formatBytes, type Asset, type AssetKind, type Job, type PlanTier } from "@clipiro/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheet, Button, Icon, OptionList, ProgressBar, SectionHeader, Skeleton, useToast } from "@/components";
import { assets, jobs } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { imageSource } from "@/lib/images";
import { pollMs } from "@/lib/poll";
import { probeDuration } from "@/lib/probe";
import { colors, derived, radius, text, type } from "@/theme";
import { usePlayer } from "../assets/AudioRow";
import { useAssetStorage, usePlanTier } from "../assets/queries";
import { mmss } from "../projects/format";
import { createKeys, useCreateContext, useRecentResults } from "./queries";
import { uploadToAssets } from "./toolUpload";
import type { UploadFile } from "./upload";

// The pieces every AI tool screen shares (AI Media's tabs, the file tools):
// the cost bar, running a job with its progress and refusals, the file a tool
// works on (from the phone or from Assets), and what the tools made lately.

/** One per press: the server won't charge twice for a retried request. */
export const newKey = () => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const lengthLabel = (sec: number) => (sec % 60 === 0 ? `${sec / 60} min` : `${sec} s`);

export function ActionBar({ cost, label, onPress, loading, disabled }: { cost: string; label: string; onPress: () => void; loading?: boolean; disabled?: boolean }) {
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
 * Runs one AI tool job (POST /jobs, then polls it) the way every tool does:
 * progress while it works, the result saved in Assets → AI Assets, a refusal
 * for credits turned into the shortfall sheet. Resolves with the finished job,
 * or null when it didn't finish (already explained to the person).
 */
export function useToolJob(cost: number) {
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

export function Working({ progress, label }: { progress: number; label: string }) {
  return (
    <View style={styles.working} accessibilityLiveRegion="polite">
      <Text style={type(14, "semibold")}>{label}</Text>
      <ProgressBar value={progress} label={`${label} progress`} />
      <Text style={text.caption}>It’s saved to Assets when it’s done, so you can leave this screen.</Text>
    </View>
  );
}

/** A tool above the person's plan: what it needs, and the way to it. */
export function PlanGate({ name, minPlan }: { name: string; minPlan: PlanTier }) {
  return (
    <View style={styles.gate}>
      <Icon name="lock" size={18} color={colors.warning} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={type(14, "semibold")}>{name} is on {PLAN_LABEL[minPlan]} and up</Text>
        <Pressable onPress={() => router.push("/you/subscription")} accessibilityRole="link" hitSlop={8}>
          <Text style={type(13, "medium", { color: colors.emeraldBright })}>See plans →</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── The file a tool works on ──────────────────────────────────────────────

/** What a tool takes: the kinds of file, and its limits. */
export type FileSpec = { name: string; accepts: readonly AssetKind[]; maxBytes: number; maxSec: number | null };

/** Picked on the phone (uploaded to Assets when the tool runs) or already in Assets. */
export type FileSource = { kind: "phone"; file: UploadFile; durationSec: number | null } | { kind: "asset"; asset: Asset; durationSec: number | null };

const MIME: Record<AssetKind, string> = { audio: "audio/*", video: "video/*", image: "image/*" };
const needsLength = (spec: FileSpec, kind: AssetKind) => kind !== "image" && (spec.maxSec != null || spec.accepts.every((k) => k !== "image"));
const kindOfMime = (m: string): AssetKind => (m.startsWith("image/") ? "image" : m.startsWith("audio/") ? "audio" : "video");

/**
 * One file input: choosing (phone or Assets), checking it against the tool's
 * limits before anything is charged, and putting a phone file into Assets
 * when the tool runs (decision 2026-10-10 A: the server reads tools' input
 * from there). A file uploaded once becomes the source, so a retry doesn't
 * upload it again.
 */
export function useFileInput(spec: FileSpec) {
  const storage = useAssetStorage();
  const plan = usePlanTier().data ?? "free";
  const [source, setSource] = useState<FileSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);

  /** Problems with a file for this tool, in words; null when it's fine. */
  const problem = (sizeBytes: number, kind: AssetKind, durationSec: number | null) => {
    if (!spec.accepts.includes(kind)) return `${spec.name} takes ${spec.accepts.join(" or ")} files.`;
    if (sizeBytes > spec.maxBytes) return `That file is over the ${formatBytes(spec.maxBytes)} limit.`;
    if (needsLength(spec, kind) && durationSec == null) return "Couldn’t read how long that file is. Try another one.";
    if (spec.maxSec != null && durationSec != null && durationSec > spec.maxSec) return `That file is ${mmss(durationSec)} long. ${spec.name} takes up to ${lengthLabel(spec.maxSec)}.`;
    return null;
  };

  const measure = async (uri: string, kind: AssetKind, known: number | null) => {
    if (known || !needsLength(spec, kind)) return known;
    setChecking(true);
    try {
      return await probeDuration(uri);
    } finally {
      setChecking(false);
    }
  };

  const pickPhone = async () => {
    setChoosing(false);
    const res = await DocumentPicker.getDocumentAsync({ type: spec.accepts.map((k) => MIME[k]), copyToCacheDirectory: true });
    const f = res.canceled ? null : res.assets[0];
    if (!f) return;
    setSource(null);
    const mimeType = f.mimeType ?? "application/octet-stream";
    const kind = kindOfMime(mimeType);
    const early = problem(f.size ?? 0, kind, 0);
    if (early) return setError(early);
    const durationSec = await measure(f.uri, kind, null);
    const p = problem(f.size ?? 0, kind, durationSec) ?? assetUploadProblem(f.size ?? 0, storage.data?.usedBytes ?? 0, plan);
    if (p) return setError(p);
    setError(null);
    setSource({ kind: "phone", file: { uri: f.uri, name: f.name, mimeType, sizeBytes: f.size ?? 0, durationSec }, durationSec });
  };

  const pickAsset = async (a: Asset) => {
    setChoosing(false);
    setSource(null);
    const durationSec = a.url ? await measure(a.url, a.kind, a.durationSec) : a.durationSec;
    const p = problem(a.sizeBytes, a.kind, durationSec);
    if (p) return setError(p);
    setError(null);
    setSource({ kind: "asset", asset: a, durationSec });
  };

  /** The file's Asset id, uploading a phone file first. */
  const assetId = async (): Promise<string> => {
    if (!source) throw new Error("Choose a file first.");
    if (source.kind === "asset") return source.asset.id;
    setUploading(0);
    try {
      const asset = await uploadToAssets(source.file, setUploading);
      setSource({ kind: "asset", asset, durationSec: source.durationSec });
      return asset.id;
    } finally {
      setUploading(null);
    }
  };

  const sheet = <SourceSheet visible={choosing} spec={spec} onClose={() => setChoosing(false)} onPhone={() => void pickPhone()} onAsset={(a) => void pickAsset(a)} />;
  return { source, error, checking, uploading, choose: () => setChoosing(true), clear: () => setSource(null), assetId, sheet };
}

/** The chosen file, or the place to choose one. */
export function FileCard({ input, spec, label, disabled }: { input: ReturnType<typeof useFileInput>; spec: FileSpec; label?: string; disabled?: boolean }) {
  const s = input.source;
  const what = spec.accepts.length === 1 ? (spec.accepts[0] === "image" ? "an image" : spec.accepts[0] === "audio" ? "an audio file" : "a video") : "an audio or video file";
  const limits = [formatBytes(spec.maxBytes), spec.maxSec != null ? lengthLabel(spec.maxSec) : null].filter(Boolean).join(" and ");
  return (
    <View style={{ gap: 8 }}>
      {label ? <Text style={text.label}>{label}</Text> : null}
      {s ? (
        <View style={styles.fileRow}>
          <View style={styles.fileIcon}>
            {s.kind === "asset" && (s.asset.thumbnailUrl ?? (s.asset.kind === "image" ? s.asset.url : null)) ? (
              <Image source={imageSource((s.asset.thumbnailUrl ?? s.asset.url)!)} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <Icon name={s.kind === "asset" ? "folder" : "file"} size={18} color={colors.emeraldBright} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type(14, "semibold")} numberOfLines={1}>
              {s.kind === "phone" ? s.file.name : s.asset.name}
            </Text>
            <Text style={type(12, "regular", { color: colors.fgMuted })}>
              {[s.durationSec ? mmss(s.durationSec) : null, formatBytes(s.kind === "phone" ? s.file.sizeBytes : s.asset.sizeBytes), s.kind === "asset" ? "in Assets" : null].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <Button label="Change" variant="ghost" size="md" onPress={input.choose} disabled={disabled} accessibilityLabel={label ? `Change ${label.toLowerCase()}` : "Change file"} />
        </View>
      ) : (
        <Pressable
          onPress={input.choose}
          disabled={input.checking || disabled}
          accessibilityRole="button"
          accessibilityLabel={`${label ? `${label}: c` : "C"}hoose ${what}, up to ${limits}`}
          style={({ pressed }) => [styles.drop, pressed && { backgroundColor: colors.surface3 }]}
        >
          <View style={styles.dropIcon}>
            <Icon name="cloudUpload" size={22} color={colors.emeraldBright} />
          </View>
          <Text style={type(15, "bold")}>{input.checking ? "Reading the file…" : "Choose a file"}</Text>
          <Text style={[type(12, "regular", { color: colors.fgMuted }), { textAlign: "center" }]}>
            {spec.accepts.includes("image") ? "PNG, JPG, WEBP" : spec.accepts.includes("audio") && spec.accepts.includes("video") ? "MP3, WAV, M4A, MP4, MOV…" : spec.accepts.includes("audio") ? "MP3, WAV, M4A…" : "MP4, MOV…"} · up to {limits}
          </Text>
        </Pressable>
      )}
      {input.error ? (
        <Text style={type(12, "medium", { color: colors.error })} accessibilityLiveRegion="polite">
          {input.error}
        </Text>
      ) : null}
      {input.sheet}
    </View>
  );
}

function SourceSheet({ visible, spec, onClose, onPhone, onAsset }: { visible: boolean; spec: FileSpec; onClose: () => void; onPhone: () => void; onAsset: (a: Asset) => void }) {
  const list = useQuery({
    queryKey: ["assets", "tool-sources", spec.accepts.join(",")],
    queryFn: async () => {
      const pages = await Promise.all(spec.accepts.map((kind) => assets.list({ kind })));
      return pages
        .flatMap((p) => p.assets)
        .filter((a) => a.status === "ready")
        .sort((x, y) => y.createdAt.localeCompare(x.createdAt));
    },
    enabled: visible,
  });
  const kindLabel: Record<AssetKind, string> = { audio: "Audio", video: "Video", image: "Image" };
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Choose a file">
      <Button label="From this phone" icon="upload" iconPosition="start" variant="secondary" fullWidth onPress={onPhone} />
      <Text style={text.label}>From Assets</Text>
      {list.isPending ? (
        <Skeleton height={56} rounded={16} />
      ) : list.isError ? (
        <Button label="Couldn’t load your files. Try again" variant="ghost" size="md" icon="refresh" iconPosition="start" onPress={() => void list.refetch()} />
      ) : list.data.length === 0 ? (
        <Text style={text.caption}>Nothing in your Assets this tool can use yet.</Text>
      ) : (
        <ScrollView style={{ maxHeight: 340 }}>
          <OptionList
            accessibilityLabel="Files in Assets"
            value={null}
            options={list.data.map((a) => {
              const tooLong = spec.maxSec != null && a.durationSec != null && a.durationSec > spec.maxSec;
              const tooBig = a.sizeBytes > spec.maxBytes;
              return {
                value: a.id,
                label: a.name,
                detail: tooBig ? `Over ${formatBytes(spec.maxBytes)}` : tooLong ? `Longer than ${lengthLabel(spec.maxSec!)}` : [kindLabel[a.kind], a.durationSec ? mmss(a.durationSec) : null, formatBytes(a.sizeBytes)].filter(Boolean).join(" · "),
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

// ── What the tools made ───────────────────────────────────────────────────

/** What the AI tools made lately (AI Assets), newest first; `source` narrows it to one tool. */
export function Results({ kind, title, source, empty }: { kind: AssetKind; title: string; source?: Asset["source"]; empty?: ReactNode }) {
  const results = useRecentResults(kind);
  const qc = useQueryClient();
  const playing = usePlayer((s) => s.playing);
  const items = (results.data ?? []).filter((m) => !source || m.source === source);
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
      ) : items.length === 0 ? (
        <Text style={[text.caption, { paddingVertical: 12 }]}>{empty ?? `Your ${kind === "image" ? "images" : kind === "video" ? "videos" : "audio"} will show up here, and in Assets.`}</Text>
      ) : kind === "image" ? (
        <View style={styles.wrapGrid}>
          {items.slice(0, 6).map((m) => (
            <View key={m.id} style={styles.imageCard} accessible accessibilityLabel={`Generated image: ${m.name}`}>
              {m.thumbnailUrl ?? m.url ? <Image source={imageSource((m.thumbnailUrl ?? m.url)!)} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
              <Star on={m.favorite} onPress={() => void toggle(m)} />
            </View>
          ))}
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {items.slice(0, 5).map((m) => (
            <View key={m.id} style={styles.audioRow}>
              {kind === "audio" ? (
                <Pressable onPress={() => usePlayer.getState().toggle(m)} accessibilityRole="button" accessibilityLabel={`${playing === m.id ? "Pause" : "Play"} ${m.name}`} style={styles.audioIcon}>
                  <Icon name={playing === m.id ? "pause" : "play"} size={18} color={colors.emeraldBright} />
                </Pressable>
              ) : (
                <View style={styles.audioIcon}>
                  {m.thumbnailUrl ? <Image source={imageSource(m.thumbnailUrl)} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="film" size={18} color={colors.emeraldBright} />}
                </View>
              )}
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
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={on ? "Remove from favourites" : "Add to favourites"} aria-selected={on} style={[styles.star, inline && styles.starInline]}>
      <Icon name="star" size={18} color={on ? colors.warning : colors.fg} filled={on} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  audioIcon: { width: 36, height: 36, borderRadius: 10, overflow: "hidden", backgroundColor: colors.tint, alignItems: "center", justifyContent: "center" },
  working: { gap: 10, padding: 14, borderRadius: radius.tile, backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.tintBorder },
  gate: { flexDirection: "row", gap: 12, padding: 14, borderRadius: radius.tile, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.warning },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, minHeight: 60, borderRadius: radius.tile, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  fileIcon: { width: 36, height: 36, borderRadius: 10, overflow: "hidden", backgroundColor: colors.tint, alignItems: "center", justifyContent: "center" },
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
