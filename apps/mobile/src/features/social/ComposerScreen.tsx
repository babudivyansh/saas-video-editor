import { BLOCK_LABELS, CAPTION_MAX, DAYS_SHORT, POST_TARGETS, bestOnline, composeRequest, parseHashtags, type Clip, type PostTarget } from "@clipiro/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, BottomSheet, Button, Header, Icon, OptionList, SegmentedControl, StatusBarScrim, TextField, useToast } from "@/components";
import { imageSource } from "@/lib/images";
import { colors, derived, radius, statusTint, text, type } from "@/theme";
import { getAudience } from "@mocks/analytics";
import { errorMessage } from "@mocks/core";
import { getClips } from "@mocks/projects";
import { publish, suggestCaptions } from "@mocks/social";
import { useSocialAccounts } from "../insights/queries";
import { mmss } from "../projects/format";
import { socialKeys, timeLabel, useComposerSeed } from "./queries";

type When = "now" | "schedule" | "best";
const WHEN = [
  { value: "now", label: "Now" },
  { value: "schedule", label: "Schedule" },
  { value: "best", label: "Best time" },
] as const;

/** Next occurrence of a weekday (0 = Mon) at an hour, from now. */
function nextSlot(day: number, hour: number) {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() + ((day - dow + 7) % 7));
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() <= Date.now() + 60_000) d.setDate(d.getDate() + 7);
  return d;
}

// design/screens/BN-Composer.html — full-screen modal. Posting is Phase 11;
// v1 posts to YouTube Shorts, Reels and Facebook are "Soon".
export function ComposerScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const seed = useComposerSeed();
  const accounts = useSocialAccounts();
  const clips = useQuery({ queryKey: ["composer", "clips"], queryFn: () => getClips("9:16") });
  const audience = useQuery({ queryKey: ["composer", "best"], queryFn: () => getAudience("youtube") });

  const ready = (clips.data ?? []).filter((c) => c.status === "ready");
  const [clipId, setClipId] = useState<string | null>(seed.clipId);
  const clip: Clip | undefined = ready.find((c) => c.id === clipId) ?? ready[0];
  const [targets] = useState<PostTarget[]>(["youtube"]);
  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [when, setWhen] = useState<When>("schedule");
  const [date, setDate] = useState<Date>(() => (seed.date ? new Date(seed.date) : nextSlot(0, 18)));
  const [sheet, setSheet] = useState<"clip" | "ai" | "tags" | "date" | "time" | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Now" when the composer opened: render must not read the clock.
  const [openedAt] = useState(() => new Date());

  const best = audience.data ? bestOnline(audience.data.online) : null;
  const bestDate = best ? nextSlot(best.day, best.block * 4 + 2) : null;
  const slot = when === "best" && bestDate ? bestDate : date;
  const yt = accounts.data?.find((a) => a.provider === "youtube");

  const close = () => (router.canGoBack() ? router.back() : router.replace("/social"));

  const ai = async () => {
    if (!clip) return;
    setSheet("ai");
    setSuggestions([]);
    try {
      const r = await suggestCaptions(clip.title);
      setSuggestions(r.captions);
      if (!tags.length) setTags(r.hashtags);
    } catch (e) {
      setSheet(null);
      toast(errorMessage(e), "error");
    }
  };

  const submit = async () => {
    if (!clip) return;
    const req = { clipId: clip.id, targets, caption, hashtags: tags, when: when === "now" ? ("now" as const) : ("schedule" as const), scheduledAt: when === "now" ? null : slot.toISOString() };
    const parsed = composeRequest.safeParse(req);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the post");
    setError(null);
    setBusy(true);
    try {
      await publish({ ...parsed.data, title: clip.title, thumbnailUrl: clip.thumbnailUrl });
      await qc.invalidateQueries({ queryKey: socialKeys.posts });
      toast(when === "now" ? "Posting to YouTube Shorts." : `Scheduled for ${slot.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, ${timeLabel(slot.toISOString())}.`, "success");
      seed.seed({});
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(openedAt);
    d.setDate(d.getDate() + i);
    return d;
  });
  const hours = Array.from({ length: 48 }, (_, i) => ({ h: Math.floor(i / 2), m: (i % 2) * 30 }));

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: 140 }]} keyboardShouldPersistTaps="handled">
        <Header
          title="New post"
          onBack={close}
          actions={
            <Pressable onPress={() => (toast("Draft saved.", "success"), close())} accessibilityRole="button" style={styles.link}>
              <Text style={type(13, "semibold", { color: colors.emeraldBright })}>Save draft</Text>
            </Pressable>
          }
        />

        {clips.isPending ? null : !clip ? (
          <View style={styles.noClip}>
            <Text style={type(15, "bold")}>No ready clips yet</Text>
            <Text style={text.caption}>Run AutoClip or export from the editor, then come back to post.</Text>
            <Button label="Start AutoClip" variant="secondary" size="sm" onPress={() => (close(), router.push("/create/autoclip"))} />
          </View>
        ) : (
          <View style={styles.clip}>
            <View style={styles.clipThumb}>
              <Image source={imageSource(clip.thumbnailUrl)} style={StyleSheet.absoluteFill} contentFit="cover" />
              <View style={styles.burn}>
                <Text style={styles.burnHot}>THIS</Text>
                <Text style={styles.burnWord}>PART</Text>
              </View>
              <Text style={styles.dur}>{mmss(clip.durationSec)}</Text>
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={type(16, "bold")} numberOfLines={3}>
                {clip.title}
              </Text>
              <Text style={type(12, "regular", { color: colors.fgMuted })}>From Founders Pod · Ep. 42</Text>
              <Button label="Change clip" variant="secondary" size="md" onPress={() => setSheet("clip")} style={{ alignSelf: "flex-start" }} />
            </View>
          </View>
        )}

        <Text style={text.label}>Post to</Text>
        <View style={styles.targets} accessibilityRole="radiogroup" accessibilityLabel="Post to">
          {POST_TARGETS.map((t) => {
            const on = targets.includes(t.id);
            const acc = accounts.data?.find((a) => a.provider === t.id);
            return (
              <Pressable
                key={t.id}
                disabled={!t.available}
                onPress={() => !t.available && toast(`${t.label} posting is coming soon.`, "info")}
                accessibilityRole="checkbox"
                aria-checked={on}
                aria-disabled={!t.available}
                accessibilityLabel={`${t.label}${t.available ? "" : ", coming soon"}`}
                style={[styles.target, on && styles.targetOn, !t.available && { opacity: 0.55 }]}
              >
                <Avatar name={acc?.name ?? t.label} source={acc?.avatarUrl ? imageSource(acc.avatarUrl) : null} size={28} decorative />
                <Text style={type(13, on ? "semibold" : "medium")}>{t.label}</Text>
                {on ? <Icon name="check" size={14} color={colors.emeraldBright} strokeWidth={2.4} /> : null}
                {!t.available ? (
                  <View style={styles.soon}>
                    <Text style={type(10, "semibold", { color: colors.fgMuted })}>Soon</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        {yt?.health === "reconnect" ? <Text style={type(12, "regular", { color: colors.warning })}>YouTube needs reconnecting before this can post.</Text> : null}

        <Text style={text.label}>Caption</Text>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Write a caption…"
          placeholderTextColor={colors.fgSubtle}
          selectionColor={colors.emeraldBright}
          accessibilityLabel="Caption"
          multiline
          maxLength={CAPTION_MAX}
          style={styles.caption}
        />
        <Text style={type(11, "regular", { color: caption.length > CAPTION_MAX * 0.9 ? colors.warning : colors.fgSubtle })}>
          AI suggestions available · {caption.length.toLocaleString("en-US")} / {CAPTION_MAX.toLocaleString("en-US")}
        </Text>
        <View style={styles.row}>
          <Button label="Write with AI" icon="sparkle" iconPosition="start" variant="secondary" size="md" onPress={ai} disabled={!clip} />
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

        <Text style={text.label}>When</Text>
        <SegmentedControl accessibilityLabel="When" options={WHEN} value={when} onChange={setWhen} />
        {when === "schedule" ? (
          <View style={styles.row}>
            <Pressable onPress={() => setSheet("date")} accessibilityRole="button" accessibilityLabel={`Date: ${slot.toDateString()}. Change`} style={styles.pick}>
              <Icon name="calendar" size={16} color={colors.emeraldBright} />
              <Text style={type(14, "semibold")}>{slot.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</Text>
            </Pressable>
            <Pressable onPress={() => setSheet("time")} accessibilityRole="button" accessibilityLabel={`Time: ${timeLabel(slot.toISOString())}. Change`} style={styles.pick}>
              <Icon name="clock" size={16} color={colors.emeraldBright} />
              <Text style={type(14, "semibold")}>{timeLabel(slot.toISOString())}</Text>
            </Pressable>
          </View>
        ) : when === "best" && best && bestDate ? (
          <Text style={type(13, "regular", { color: colors.fgMuted })}>
            Your audience is most active {DAYS_SHORT[best.day]} around {BLOCK_LABELS[best.block]}. We’ll post {bestDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at {timeLabel(bestDate.toISOString())}.
          </Text>
        ) : null}
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
          <Text style={type(14, "bold")}>Free · {targets.length} platform</Text>
        </View>
        <Button label={when === "now" ? "Post now" : "Schedule post"} onPress={submit} loading={busy} disabled={!clip} style={{ flex: 1 }} />
      </View>

      <BottomSheet visible={sheet === "clip"} onClose={() => setSheet(null)} title="Choose a clip">
        <ScrollView style={{ maxHeight: 420 }}>
          <OptionList
            accessibilityLabel="Clip"
            value={clip?.id ?? null}
            options={ready.map((c) => ({ value: c.id, label: c.title, detail: `${mmss(c.durationSec)} · score ${c.score ?? "—"}` }))}
            onChange={(id) => (setClipId(id), setSheet(null))}
          />
        </ScrollView>
      </BottomSheet>
      <BottomSheet visible={sheet === "ai"} onClose={() => setSheet(null)} title="Caption ideas">
        {suggestions.length ? (
          <OptionList accessibilityLabel="Caption ideas" value={null} options={suggestions.map((s, i) => ({ value: String(i), label: s }))} onChange={(i) => (setCaption(suggestions[Number(i)] ?? ""), setSheet(null))} />
        ) : (
          <Text style={text.caption}>Writing…</Text>
        )}
        <Text style={text.caption}>Free, up to 20 an hour.</Text>
      </BottomSheet>
      <BottomSheet visible={sheet === "tags"} onClose={() => setSheet(null)} title="Hashtags">
        <TextField label="Add hashtags" value={tagInput} onChangeText={setTagInput} placeholder="#founders #startup" autoCapitalize="none" autoCorrect={false} onSubmitEditing={() => (setTags((l) => [...new Set([...l, ...parseHashtags(tagInput)])]), setTagInput(""))} returnKeyType="done" />
        <Button
          label="Add"
          variant="secondary"
          size="sm"
          fullWidth
          onPress={() => {
            setTags((l) => [...new Set([...l, ...parseHashtags(tagInput)])]);
            setTagInput("");
            setSheet(null);
          }}
        />
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
              const past = d.getTime() <= openedAt.getTime();
              return { value: `${h}:${m}`, label: timeLabel(d.toISOString()), disabled: past, detail: past ? "Already passed" : undefined };
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
  link: { minHeight: 44, justifyContent: "center", paddingLeft: 10 },
  clip: { flexDirection: "row", gap: 14 },
  clipThumb: { width: 104, height: 168, borderRadius: radius.tile, overflow: "hidden", backgroundColor: colors.surface3 },
  dur: { position: "absolute", right: 6, bottom: 6, ...type(11, "regular", { mono: true }), backgroundColor: derived.overlay, paddingHorizontal: 5, borderRadius: 5, overflow: "hidden" },
  burn: { position: "absolute", left: 0, right: 0, bottom: 26, flexDirection: "row", justifyContent: "center", gap: 4 },
  burnWord: { ...type(10, "heavy"), textShadowColor: colors.bg, textShadowRadius: 4 },
  burnHot: { ...type(10, "heavy", { color: colors.bg }), backgroundColor: colors.emeraldBright, paddingHorizontal: 3, borderRadius: 3, overflow: "hidden" },
  noClip: { gap: 8, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  targets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  target: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingLeft: 6, paddingRight: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong },
  targetOn: { backgroundColor: colors.tint, borderColor: colors.emeraldBright },
  soon: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: statusTint(colors.fgMuted) },
  caption: { ...type(15, "regular", { lineHeight: 1.5 }), minHeight: 110, padding: 14, borderRadius: radius.tile, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.lineStrong, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 10 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.tintBorder, justifyContent: "center" },
  pick: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 52, borderRadius: radius.tile, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.lineStrong },
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 12, paddingHorizontal: 16, backgroundColor: colors.bgDeep, borderTopWidth: 1, borderTopColor: colors.lineStrong },
});
