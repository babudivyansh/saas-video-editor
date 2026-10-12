import {
  BLOCK_LABELS,
  DAYS_SHORT,
  POST_HASHTAGS_MAX,
  POST_MIN_LEAD_MIN,
  POST_PRIVACY,
  POST_TITLE_MAX,
  bestOnline,
  captionLimit,
  isAutoPost,
  parseHashtags,
  type CreatePostsRequest,
  type PostPrivacy,
  type SocialAccount,
} from "@clipiro/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, BottomSheet, Button, EmptyState, Header, Icon, OptionList, SegmentedControl, StatusBarScrim, TextField, useToast } from "@/components";
import { assets, projects, social } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { imageSource } from "@/lib/images";
import { colors, derived, radius, statusTint, text, type } from "@/theme";
import { SocialUpsell } from "../insights/InsightsShell";
import { isUpsell, useSocialAccounts } from "../insights/queries";
import { mmss } from "../projects/format";
import { dayLabel, platformLabel, socialKeys, timeLabel, useComposerSeed, usePost } from "./queries";

type When = "now" | "schedule" | "best";
const WHEN = [
  { value: "now", label: "Now" },
  { value: "schedule", label: "Schedule" },
  { value: "best", label: "Best time" },
] as const;
const PRIVACY_LABEL: Record<PostPrivacy, string> = { public: "Public", unlisted: "Unlisted", private: "Private" };
const PRIVACY = POST_PRIVACY.map((p) => ({ value: p, label: PRIVACY_LABEL[p] }));
const POSTABLE = new Set(["youtube", "instagram", "facebook"]);

/** The video being posted: a clip, or a video from Assets. */
type Source = { kind: "clip" | "asset"; id: string; title: string; thumbnailUrl: string | null; durationSec: number | null; detail: string };

/** A scheduled time closer than the minimum lead (read when posting, not while rendering). */
const tooSoon = (d: Date) => d.getTime() < Date.now() + POST_MIN_LEAD_MIN * 60_000;

/** Next occurrence of a weekday (0 = Mon) at an hour, at least the minimum lead from now. */
function nextSlot(day: number, hour: number) {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() + ((day - dow + 7) % 7));
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() <= Date.now() + POST_MIN_LEAD_MIN * 60_000) d.setDate(d.getDate() + 7);
  return d;
}

// design/screens/BN-Composer.html — full-screen modal. Posts through
// /api/mobile/v1/social/posts (docs/mobile/SCHEDULING.md): YouTube is posted
// by Clipiro; Instagram and Facebook become the person's turn to post.
export function ComposerScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [seed] = useState(() => useComposerSeed.getState());
  const editing = usePost(seed.editId);
  const isEdit = !!seed.editId;
  const accounts = useSocialAccounts();

  const clips = useQuery({ queryKey: ["composer", "clips"], queryFn: () => projects.clips({}).then((r) => r.clips.filter((c) => c.status === "ready")), enabled: !isEdit });
  const videos = useQuery({ queryKey: ["composer", "videos"], queryFn: () => assets.list({ kind: "video" }).then((r) => r.assets.filter((a) => a.status === "ready")), enabled: !isEdit });
  const [source, setSource] = useState<Source | null>(null);

  // The seeded video: a clip or Assets video that may not be on the first page.
  const seeded = useQuery({
    queryKey: ["composer", "seed", seed.clipId, seed.assetId],
    enabled: !isEdit && !!(seed.clipId || seed.assetId),
    queryFn: async (): Promise<Source> => {
      if (seed.clipId) {
        const c = await projects.clip(seed.clipId);
        return { kind: "clip", id: c.id, title: c.title, thumbnailUrl: c.thumbnailUrl, durationSec: c.durationSec, detail: c.projectTitle };
      }
      const a = await assets.get(seed.assetId!);
      return { kind: "asset", id: a.id, title: a.name.replace(/\.[a-z0-9]{2,4}$/i, ""), thumbnailUrl: a.thumbnailUrl, durationSec: a.durationSec, detail: "From your Assets" };
    },
  });
  const firstClip = clips.data?.[0];
  const fallback: Source | null = firstClip ? { kind: "clip", id: firstClip.id, title: firstClip.title, thumbnailUrl: firstClip.thumbnailUrl, durationSec: firstClip.durationSec, detail: `Clip #${firstClip.rank}` } : null;
  const post = editing.data;
  const chosen: Source | null = isEdit
    ? post
      ? { kind: post.clipId ? "clip" : "asset", id: post.clipId ?? post.assetId ?? "", title: post.title, thumbnailUrl: post.thumbnailUrl, durationSec: null, detail: `${platformLabel(post.account.provider)} · ${post.account.name}` }
      : null
    : (source ?? seeded.data ?? (seed.clipId || seed.assetId ? null : fallback));

  const postable = (accounts.data ?? []).filter((a) => POSTABLE.has(a.provider));
  const [picked, setPicked] = useState<string[] | null>(null);
  // Default: every healthy YouTube account (the one Clipiro posts itself).
  const selected = picked ?? postable.filter((a) => a.provider === "youtube" && a.health !== "reconnect").map((a) => a.id);
  const selectedAccounts = postable.filter((a) => selected.includes(a.id));
  const providers = isEdit && post ? [post.account.provider] : selectedAccounts.map((a) => a.provider);
  const hasYouTube = providers.includes("youtube");
  const limit = captionLimit(providers);
  const ytAccount = postable.find((a) => a.provider === "youtube" && a.health !== "reconnect");

  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState(seed.caption ?? "");
  const [tags, setTags] = useState<string[]>(seed.hashtags ?? []);
  const [privacy, setPrivacy] = useState<PostPrivacy>("public");
  const [when, setWhen] = useState<When>(isEdit ? "schedule" : seed.date ? "schedule" : "now");
  const [date, setDate] = useState<Date>(() => (seed.date ? new Date(seed.date) : nextSlot((new Date().getDay() + 6) % 7, 18)));
  const [sheet, setSheet] = useState<"source" | "ai" | "tags" | "date" | "time" | null>(null);
  const [sourceTab, setSourceTab] = useState<"clips" | "assets">("clips");
  const [ideas, setIdeas] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Now" when the composer opened: render must not read the clock.
  const [openedAt] = useState(() => new Date());

  // Editing: start from the post as it is, once it has loaded.
  const [filled, setFilled] = useState(false);
  if (post && !filled) {
    setFilled(true);
    setTitle(post.title);
    setCaption(post.caption);
    setTags(post.hashtags);
    setPrivacy(post.privacy);
    if (post.scheduledAt) setDate(new Date(post.scheduledAt));
  }

  const audience = useQuery({ queryKey: ["composer", "best", ytAccount?.id], queryFn: () => social.audience(ytAccount!.id), enabled: !!ytAccount && !isEdit });
  const hasAudience = !!audience.data?.online.some((row) => row.some((v) => v > 0));
  const best = hasAudience ? bestOnline(audience.data!.online) : null;
  const bestDate = best ? nextSlot(best.day, best.block * 4 + 2) : null;
  const slot = when === "best" && bestDate ? bestDate : date;

  const close = () => {
    useComposerSeed.getState().seed({});
    if (router.canGoBack()) router.back();
    else router.replace("/social/scheduled-posts");
  };

  const toggle = (a: SocialAccount) => {
    if (a.health === "reconnect") return toast(`Reconnect ${platformLabel(a.provider)} on the Accounts tab first.`, "info");
    setPicked(selected.includes(a.id) ? selected.filter((x) => x !== a.id) : [...selected, a.id]);
  };

  const ai = async () => {
    const accountId = selected[0] ?? post?.account.id ?? postable[0]?.id;
    if (!chosen || !accountId) return;
    setSheet("ai");
    setIdeas([]);
    try {
      const r = await social.captionIdeas({ accountId, brief: chosen.title });
      setIdeas(r.captions.map((c) => c.text));
      if (!tags.length) setTags(r.hashtags.slice(0, POST_HASHTAGS_MAX));
    } catch (e) {
      setSheet(null);
      toast(apiErrorMessage(e), "error");
    }
  };

  const addTags = () => {
    setTags((l) => [...new Set([...l, ...parseHashtags(tagInput)])].slice(0, POST_HASHTAGS_MAX));
    setTagInput("");
  };

  /** What can be checked before asking the server. */
  const problem = (): string | null => {
    if (!chosen) return "Choose a video to post";
    if (!isEdit && selected.length === 0) return "Pick where to post";
    if (caption.length > limit) return `Keep the caption under ${limit.toLocaleString("en-US")} characters${limit < 5000 ? " for Instagram and Facebook" : ""}`;
    if (when !== "now" && tooSoon(slot)) return `Pick a time at least ${POST_MIN_LEAD_MIN} minutes from now`;
    return null;
  };

  const done = (message: string) => {
    void qc.invalidateQueries({ queryKey: socialKeys.posts });
    toast(message, "success");
    close();
  };

  const submit = async () => {
    const p = problem();
    if (p) return setError(p);
    setError(null);
    setBusy(true);
    try {
      if (isEdit && post) {
        await social.updatePost(post.id, { title: title.trim() || null, caption, hashtags: tags, privacy, scheduledAt: slot.toISOString() });
        void qc.invalidateQueries({ queryKey: socialKeys.post(post.id) });
        return done(`Changes saved. Posts ${dayLabel(slot.toISOString())}, ${timeLabel(slot.toISOString())}.`);
      }
      const body: CreatePostsRequest = {
        source: chosen!.kind === "clip" ? { clipId: chosen!.id } : { assetId: chosen!.id },
        accountIds: selected,
        ...(title.trim() && title.trim() !== chosen!.title ? { title: title.trim() } : {}),
        caption,
        hashtags: tags,
        privacy,
        when: when === "now" ? "now" : slot.toISOString(),
      };
      const r = await social.createPosts(body);
      // One toast: a second would replace the first.
      const notes = [
        r.warnings.includes("not_short") ? "YouTube will post this as a regular video, not a Short: it’s over 3 minutes or not vertical." : null,
        r.warnings.includes("uploads_busy") ? "YouTube posting is full for today, so it goes out as soon as there’s room." : null,
      ].filter(Boolean);
      const auto = selectedAccounts.filter((a) => isAutoPost(a.provider)).map((a) => platformLabel(a.provider));
      const manual = selectedAccounts.filter((a) => !isAutoPost(a.provider)).map((a) => platformLabel(a.provider));
      if (when === "now") {
        done([auto.length ? `Posting to ${auto.join(" and ")}.` : null, manual.length ? `Your turn on ${manual.join(" and ")}: it’s in Scheduled.` : null, ...notes].filter(Boolean).join(" "));
      } else {
        done([`Scheduled for ${dayLabel(slot.toISOString())}, ${timeLabel(slot.toISOString())}.`, manual.length ? `We’ll remind you to post on ${manual.join(" and ")}.` : null, ...notes].filter(Boolean).join(" "));
      }
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(openedAt);
    d.setDate(d.getDate() + i);
    return d;
  });
  const hours = Array.from({ length: 48 }, (_, i) => ({ h: Math.floor(i / 2), m: (i % 2) * 30 }));
  const loading = isEdit ? editing.isPending : clips.isPending || seeded.isLoading;

  if (isUpsell(accounts.error)) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 12, paddingHorizontal: 16, gap: 12 }]}>
        <Header title="New post" onBack={close} />
        <SocialUpsell />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: 140 }]} keyboardShouldPersistTaps="handled">
        <Header title={isEdit ? "Edit post" : "New post"} onBack={close} />

        {loading ? null : editing.isError ? (
          <EmptyState tone="error" title="Couldn’t open this post" body={apiErrorMessage(editing.error)} action={{ label: "Back", onPress: close }} />
        ) : !chosen ? (
          <View style={styles.noClip}>
            <Text style={type(15, "bold")}>Nothing ready to post yet</Text>
            <Text style={text.caption}>Run AutoClip, or export from the editor and save it to Assets, then come back to post.</Text>
            <View style={styles.row}>
              <Button label="Start AutoClip" variant="secondary" size="sm" onPress={() => (close(), router.push("/create/autoclip"))} />
              {videos.data?.length ? <Button label="Pick from Assets" variant="secondary" size="sm" onPress={() => (setSourceTab("assets"), setSheet("source"))} /> : null}
            </View>
          </View>
        ) : (
          <View style={styles.clip}>
            <View style={styles.clipThumb}>
              {chosen.thumbnailUrl ? <Image source={imageSource(chosen.thumbnailUrl)} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="play" size={28} color={colors.fgSubtle} />}
              {chosen.durationSec != null ? <Text style={styles.dur}>{mmss(chosen.durationSec)}</Text> : null}
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={type(16, "bold")} numberOfLines={3}>
                {chosen.title}
              </Text>
              <Text style={type(12, "regular", { color: colors.fgMuted })}>{chosen.detail}</Text>
              {isEdit ? null : <Button label="Change video" variant="secondary" size="md" onPress={() => setSheet("source")} style={{ alignSelf: "flex-start" }} />}
            </View>
          </View>
        )}

        {isEdit ? null : (
          <>
            <Text style={text.label}>Post to</Text>
            {postable.length === 0 && !accounts.isPending ? (
              <View style={styles.noClip}>
                <Text style={text.caption}>Connect YouTube, Instagram or Facebook to post.</Text>
                <Button label="Connect an account" variant="secondary" size="sm" onPress={() => (close(), router.push("/social"))} />
              </View>
            ) : (
              <View style={styles.targets}>
                {postable.map((a) => {
                  const on = selected.includes(a.id);
                  const stale = a.health === "reconnect";
                  const label = `${platformLabel(a.provider)}, ${a.name}${stale ? ", needs reconnecting" : isAutoPost(a.provider) ? "" : ", you post it"}`;
                  return (
                    <Pressable
                      key={a.id}
                      onPress={() => toggle(a)}
                      accessibilityRole="checkbox"
                      aria-checked={on}
                      aria-disabled={stale}
                      accessibilityLabel={label}
                      style={[styles.target, on && styles.targetOn, stale && { opacity: 0.55 }]}
                    >
                      <Avatar name={a.name} source={a.avatarUrl ? imageSource(a.avatarUrl) : null} size={28} decorative />
                      <Text style={type(13, on ? "semibold" : "medium")}>{platformLabel(a.provider)}</Text>
                      {on ? <Icon name="check" size={14} color={colors.emeraldBright} strokeWidth={2.4} /> : null}
                      {stale || !isAutoPost(a.provider) ? (
                        <View style={styles.soon}>
                          <Text style={type(10, "semibold", { color: stale ? colors.warning : colors.fgMuted })}>{stale ? "Reconnect" : "You post"}</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
            {selectedAccounts.some((a) => !isAutoPost(a.provider)) ? (
              <Text style={type(12, "regular", { color: colors.fgMuted })}>
                Clipiro can’t post to Instagram or Facebook for you yet. At the time, we’ll remind you; you share the video, then paste its link.
              </Text>
            ) : null}
          </>
        )}

        {hasYouTube ? <TextField label="YouTube title" value={title} onChangeText={setTitle} placeholder={chosen?.title ?? "Title"} maxLength={POST_TITLE_MAX} /> : null}

        <Text style={text.label}>Caption</Text>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Write a caption…"
          placeholderTextColor={colors.fgSubtle}
          selectionColor={colors.emeraldBright}
          accessibilityLabel="Caption"
          multiline
          style={styles.caption}
        />
        <Text style={type(11, "regular", { color: caption.length > limit ? colors.error : caption.length > limit * 0.9 ? colors.warning : colors.fgSubtle })}>
          {caption.length.toLocaleString("en-US")} / {limit.toLocaleString("en-US")}
        </Text>
        <View style={styles.row}>
          <Button label="Write with AI" icon="sparkle" iconPosition="start" variant="secondary" size="md" onPress={ai} disabled={!chosen || postable.length === 0} />
          <Button label="Hashtags" icon="text" iconPosition="start" variant="secondary" size="md" onPress={() => setSheet("tags")} />
        </View>
        {tags.length ? (
          <View style={styles.tags}>
            {tags.map((t) => (
              <Pressable key={t} onPress={() => setTags((l) => l.filter((x) => x !== t))} accessibilityRole="button" accessibilityLabel={`Remove ${t}`} style={styles.tag}>
                <Text style={type(12, "medium", { color: colors.emeraldBright })}>{t}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {hasYouTube ? (
          <>
            <Text style={text.label}>On YouTube</Text>
            <SegmentedControl accessibilityLabel="Visibility" options={PRIVACY} value={privacy} onChange={setPrivacy} />
          </>
        ) : null}

        <Text style={text.label}>When</Text>
        {isEdit ? null : <SegmentedControl accessibilityLabel="When" options={best ? WHEN : WHEN.filter((w) => w.value !== "best")} value={when} onChange={setWhen} />}
        {when === "schedule" ? (
          <View style={styles.row}>
            <Pressable onPress={() => setSheet("date")} accessibilityRole="button" accessibilityLabel={`Date: ${slot.toDateString()}. Change`} style={styles.pick}>
              <Icon name="calendar" size={16} color={colors.emeraldBright} />
              <Text style={type(14, "semibold")}>{dayLabel(slot.toISOString())}</Text>
            </Pressable>
            <Pressable onPress={() => setSheet("time")} accessibilityRole="button" accessibilityLabel={`Time: ${timeLabel(slot.toISOString())}. Change`} style={styles.pick}>
              <Icon name="clock" size={16} color={colors.emeraldBright} />
              <Text style={type(14, "semibold")}>{timeLabel(slot.toISOString())}</Text>
            </Pressable>
          </View>
        ) : when === "best" && best && bestDate ? (
          <Text style={type(13, "regular", { color: colors.fgMuted })}>
            Your audience is most active {DAYS_SHORT[best.day]} around {BLOCK_LABELS[best.block]}. We’ll post {dayLabel(bestDate.toISOString())} at {timeLabel(bestDate.toISOString())}.
          </Text>
        ) : null}
        {when !== "now" && hasYouTube ? <Text style={text.caption}>YouTube posts go out within 10 minutes of the time.</Text> : null}
        {error ? (
          <Text style={type(13, "medium", { color: colors.error })} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <StatusBarScrim />
      <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
        <View>
          <Text style={type(11, "regular", { color: colors.fgSubtle })}>Cost</Text>
          <Text style={type(14, "bold")}>{isEdit ? "Free" : `Free · ${selected.length} account${selected.length === 1 ? "" : "s"}`}</Text>
        </View>
        <Button label={isEdit ? "Save changes" : when === "now" ? "Post now" : "Schedule post"} onPress={submit} loading={busy} disabled={!chosen || loading} style={{ flex: 1 }} />
      </View>

      <BottomSheet visible={sheet === "source"} onClose={() => setSheet(null)} title="Choose a video">
        <SegmentedControl
          accessibilityLabel="Video source"
          options={[
            { value: "clips", label: "Clips" },
            { value: "assets", label: "Assets" },
          ]}
          value={sourceTab}
          onChange={setSourceTab}
        />
        <ScrollView style={{ maxHeight: 420 }}>
          {sourceTab === "clips" ? (
            <OptionList
              accessibilityLabel="Clip"
              value={chosen?.kind === "clip" ? chosen.id : null}
              options={(clips.data ?? []).map((c) => ({ value: c.id, label: c.title, detail: `${mmss(c.durationSec)} · score ${c.score ?? "—"}` }))}
              onChange={(id) => {
                const c = clips.data!.find((x) => x.id === id)!;
                setSource({ kind: "clip", id: c.id, title: c.title, thumbnailUrl: c.thumbnailUrl, durationSec: c.durationSec, detail: `Clip #${c.rank}` });
                setSheet(null);
              }}
            />
          ) : (
            <OptionList
              accessibilityLabel="Assets video"
              value={chosen?.kind === "asset" ? chosen.id : null}
              options={(videos.data ?? []).map((a) => ({ value: a.id, label: a.name, detail: a.durationSec != null ? mmss(a.durationSec) : undefined }))}
              onChange={(id) => {
                const a = videos.data!.find((x) => x.id === id)!;
                setSource({ kind: "asset", id: a.id, title: a.name.replace(/\.[a-z0-9]{2,4}$/i, ""), thumbnailUrl: a.thumbnailUrl, durationSec: a.durationSec, detail: "From your Assets" });
                setSheet(null);
              }}
            />
          )}
          {(sourceTab === "clips" ? clips.data : videos.data)?.length === 0 ? <Text style={text.caption}>{sourceTab === "clips" ? "No ready clips yet." : "No videos in your Assets yet."}</Text> : null}
        </ScrollView>
      </BottomSheet>
      <BottomSheet visible={sheet === "ai"} onClose={() => setSheet(null)} title="Caption ideas">
        {ideas.length ? (
          <OptionList accessibilityLabel="Caption ideas" value={null} options={ideas.map((s, i) => ({ value: String(i), label: s }))} onChange={(i) => (setCaption(ideas[Number(i)] ?? ""), setSheet(null))} />
        ) : (
          <Text style={text.caption}>Writing…</Text>
        )}
        <Text style={text.caption}>Free, up to 20 an hour.</Text>
      </BottomSheet>
      <BottomSheet visible={sheet === "tags"} onClose={() => setSheet(null)} title="Hashtags">
        <TextField label="Add hashtags" value={tagInput} onChangeText={setTagInput} placeholder="#founders #startup" autoCapitalize="none" autoCorrect={false} onSubmitEditing={addTags} returnKeyType="done" />
        <Text style={text.caption}>
          {tags.length} / {POST_HASHTAGS_MAX}
        </Text>
        <Button label="Add" variant="secondary" size="sm" fullWidth onPress={() => (addTags(), setSheet(null))} />
      </BottomSheet>
      <BottomSheet visible={sheet === "date"} onClose={() => setSheet(null)} title="Date">
        <ScrollView style={{ maxHeight: 420 }}>
          <OptionList
            accessibilityLabel="Date"
            value={date.toDateString()}
            options={days.map((d, i) => ({ value: d.toDateString(), label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) }))}
            onChange={(v) => {
              const d = new Date(v);
              d.setHours(date.getHours(), date.getMinutes(), 0, 0);
              setDate(d);
              setSheet(null);
            }}
          />
        </ScrollView>
      </BottomSheet>
      <BottomSheet visible={sheet === "time"} onClose={() => setSheet(null)} title="Time">
        <ScrollView style={{ maxHeight: 420 }}>
          <OptionList
            accessibilityLabel="Time"
            value={`${date.getHours()}:${date.getMinutes()}`}
            options={hours.map(({ h, m }) => {
              const d = new Date(date);
              d.setHours(h, m, 0, 0);
              const past = d.getTime() < openedAt.getTime() + POST_MIN_LEAD_MIN * 60_000;
              return { value: `${h}:${m}`, label: timeLabel(d.toISOString()), disabled: past, detail: past ? "Too soon" : undefined };
            })}
            onChange={(v) => {
              const [h, m] = v.split(":").map(Number);
              const d = new Date(date);
              d.setHours(h ?? 18, m ?? 0, 0, 0);
              setDate(d);
              setSheet(null);
            }}
          />
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 12 },
  clip: { flexDirection: "row", gap: 14 },
  clipThumb: { width: 104, height: 168, borderRadius: radius.tile, overflow: "hidden", backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" },
  dur: { position: "absolute", right: 6, bottom: 6, ...type(11, "regular", { mono: true }), backgroundColor: derived.overlay, paddingHorizontal: 5, borderRadius: 5, overflow: "hidden" },
  noClip: { gap: 8, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  targets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  target: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingLeft: 6, paddingRight: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong },
  targetOn: { backgroundColor: colors.tint, borderColor: colors.emeraldBright },
  soon: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: statusTint(colors.fgMuted) },
  caption: { ...type(15, "regular", { lineHeight: 1.5 }), minHeight: 110, padding: 14, borderRadius: radius.tile, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.lineStrong, textAlignVertical: "top" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.tintBorder, justifyContent: "center" },
  pick: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 52, borderRadius: radius.tile, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.lineStrong },
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 12, paddingHorizontal: 16, backgroundColor: colors.bgDeep, borderTopWidth: 1, borderTopColor: colors.lineStrong },
});
