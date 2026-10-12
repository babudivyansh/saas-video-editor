import { assistantSendRequest, type AssistantCard, type AssistantMessage } from "@clipiro/shared";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { router } from "expo-router";
import { fetch as streamFetch } from "expo/fetch";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConfirmSheet, EmptyState, Header, Icon, IconButton, ScoreBadge, SkeletonCard, useToast } from "@/components";
import { assistant } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { imageSource } from "@/lib/images";
import { colors, derived, radius, text as textStyles, type } from "@/theme";
import { useAutoClipDraft } from "../create/draft";
import { startEdit } from "../editor/open";
import { useComposerSeed } from "../social/queries";
import { homeKeys, useAssistantHistory } from "./queries";

/** Starting points, matching what Clipiro AI can do (lib/assistant/tools.ts). */
export const ASSISTANT_SUGGESTIONS = ["Find the best hooks in my latest project", "Write a caption for my top clip", "Best time to post on YouTube?"];

type Local = AssistantMessage & { status?: "sending" | "failed" };
/** The reply being written: its text so far, cards, and what a tool is doing. */
type Live = { text: string; cards: AssistantCard[]; status: string | null };

const tz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

// design/screens/BN-Assistant.html — full-screen chat with Clipiro AI
// (/api/mobile/v1/assistant, mobile Phase 13). Replies stream in as they're
// written; tools the server runs on the person's own data come back as cards.
export function AssistantScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const history = useAssistantHistory();
  const [local, setLocal] = useState<Local[]>([]);
  const [live, setLive] = useState<Live | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [clearing, setClearing] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const seq = useRef(0);

  const saved = history.data?.messages ?? [];
  const messages: Local[] = [...saved, ...local];
  const remaining = left ?? history.data?.remaining ?? null;
  const busy = live != null;

  const send = async (raw: string, retryId?: string) => {
    const parsed = assistantSendRequest.safeParse({ text: raw });
    if (!parsed.success || busy) return;
    const id = retryId ?? `local_${++seq.current}`;
    setLocal((m) =>
      retryId
        ? m.map((x) => (x.id === id ? { ...x, status: "sending" } : x))
        : [...m, { id, role: "user", text: parsed.data.text, createdAt: new Date().toISOString(), status: "sending" }],
    );
    if (!retryId) setDraft("");
    setLive({ text: "", cards: [], status: null });
    try {
      await assistant.send(parsed.data.text, { fetch: streamFetch as unknown as typeof fetch, tz: tz() }, (e) => {
        if (e.type === "user") setLocal((m) => m.map((x) => (x.id === id ? e.message : x)));
        else if (e.type === "text") setLive((l) => l && { ...l, text: l.text + e.delta, status: null });
        else if (e.type === "status") setLive((l) => l && { ...l, status: e.label });
        else if (e.type === "card") setLive((l) => l && { ...l, cards: [...l.cards, e.card], status: null });
        else if (e.type === "done") {
          setLocal((m) => [...m, e.message]);
          setLeft(e.remaining);
        } else if (e.type === "error") {
          setLocal((m) => [...m, { id: `err_${id}`, role: "assistant", text: e.error, createdAt: new Date().toISOString() }]);
        }
      });
    } catch (e) {
      // Refused before any reply (the day's allowance, offline): the message wasn't sent.
      setLocal((m) => m.map((x) => (x.id === id ? { ...x, status: "failed" } : x)));
      toast(apiErrorMessage(e), "error");
    } finally {
      setLive(null);
    }
  };

  const newChat = async () => {
    setClearing(false);
    try {
      await assistant.clear();
      setLocal([]);
      await qc.invalidateQueries({ queryKey: homeKeys.assistant });
    } catch (e) {
      toast(apiErrorMessage(e), "error");
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Header
          title="Clipiro AI"
          subtitle={remaining != null ? `${remaining} message${remaining === 1 ? "" : "s"} left today` : "Your creative assistant"}
          onBack={() => (router.canGoBack() ? router.back() : router.replace("/home"))}
          actions={messages.length ? <IconButton icon="refresh" accessibilityLabel="New chat" onPress={() => setClearing(true)} /> : null}
        />
      </View>

      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={styles.thread}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
      >
        {history.isPending ? (
          <>
            <SkeletonCard lines={1} />
            <SkeletonCard lines={3} />
          </>
        ) : history.isError ? (
          <EmptyState tone="error" title="Couldn’t load the conversation" body={apiErrorMessage(history.error)} action={{ label: "Try again", onPress: () => history.refetch() }} />
        ) : messages.length === 0 && !busy ? (
          <EmptyState icon="sparkle" title="What are we making today?" body="Ask for the best hooks in a project, a caption, the best time to post, or clips from a video." />
        ) : (
          <>
            {messages[0] ? <Text style={[type(11, "regular", { color: colors.fgSubtle }), styles.center]}>{dayLabel(messages[0].createdAt)}</Text> : null}
            {messages.map((m) => (m.role === "user" ? <UserBubble key={m.id} m={m} onRetry={() => send(m.text, m.id)} /> : <AssistantTurn key={m.id} text={m.text} cards={m.cards ?? []} />))}
          </>
        )}
        {live ? (
          live.text || live.cards.length ? (
            <AssistantTurn text={live.text} cards={live.cards} status={live.status} />
          ) : (
            <Typing label={live.status} />
          )
        ) : null}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: insets.bottom + 12 }]}>
        {messages.length === 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
            {ASSISTANT_SUGGESTIONS.map((s) => (
              <Pressable key={s} onPress={() => send(s)} accessibilityRole="button" accessibilityHint="Sends this message" style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: colors.surface3 }]}>
                <Text style={type(12)} numberOfLines={1}>
                  {s}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <View style={styles.inputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask Clipiro AI anything…"
            placeholderTextColor={colors.fgSubtle}
            selectionColor={colors.emeraldBright}
            cursorColor={colors.emeraldBright}
            accessibilityLabel="Message Clipiro AI"
            returnKeyType="send"
            onSubmitEditing={() => send(draft)}
            submitBehavior="submit"
            maxLength={2000}
            // Grows with the message (and with large system text) instead of clipping; Enter still sends.
            multiline
            style={styles.input}
          />
          <Pressable
            onPress={() => send(draft)}
            disabled={!draft.trim() || busy}
            accessibilityRole="button"
            accessibilityLabel="Send"
            aria-disabled={!draft.trim() || busy}
            style={({ pressed }) => [styles.send, (!draft.trim() || busy) && { opacity: 0.5 }, pressed && { backgroundColor: colors.primaryPress }]}
          >
            <Icon name="arrowRight" size={20} color={colors.onPrimary} strokeWidth={2.4} />
          </Pressable>
        </View>
      </View>
      <ConfirmSheet
        visible={clearing}
        title="Start a new chat?"
        body="This conversation is cleared. Your projects, clips and posts aren’t touched."
        confirmLabel="New chat"
        onClose={() => setClearing(false)}
        onConfirm={() => void newChat()}
      />
    </KeyboardAvoidingView>
  );
}

function UserBubble({ m, onRetry }: { m: Local; onRetry: () => void }) {
  return (
    <View style={styles.userCol}>
      <View style={[styles.userBubble, m.status === "sending" && { opacity: 0.7 }]}>
        <Text style={type(14, "regular", { lineHeight: 1.5 })}>{m.text}</Text>
      </View>
      {m.status === "failed" ? (
        <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Message not sent. Try again" style={styles.retry}>
          <Icon name="alert" size={14} color={colors.error} />
          <Text style={type(12, "medium", { color: colors.error })}>Not sent · Tap to retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function AiAvatar() {
  return (
    <View style={styles.aiAvatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Icon name="sparkle" size={16} color={colors.bg} strokeWidth={2} />
    </View>
  );
}

/** **bold** in a reply, nothing more: the model's other markdown shows as written. */
function Rich({ text }: { text: string }) {
  return (
    <Text style={type(14, "regular", { lineHeight: 1.55 })} accessibilityLabel={`Clipiro AI: ${text.replace(/\*\*/g, "")}`}>
      {text.split("**").map((part, i) =>
        i % 2 ? (
          <Text key={i} style={type(14, "semibold")}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

function AssistantTurn({ text, cards, status }: { text: string; cards: AssistantCard[]; status?: string | null }) {
  return (
    <View style={styles.aiRow}>
      <AiAvatar />
      <View style={styles.aiBody}>
        {text ? <Rich text={text} /> : null}
        {cards.map((c, i) => (
          <CardView key={i} card={c} />
        ))}
        {status ? (
          <Text style={textStyles.caption} accessibilityLiveRegion="polite">
            {status}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function CardView({ card }: { card: AssistantCard }) {
  switch (card.type) {
    case "hooks":
      return <HooksCard card={card} />;
    case "caption":
      return <CaptionCard card={card} />;
    case "best_time":
      return <BestTimeCard card={card} />;
    case "autoclip":
      return <AutoClipCard card={card} />;
  }
}

function Actions({ items }: { items: { label: string; onPress: () => void }[] }) {
  return (
    <View style={styles.actions}>
      {items.map((a, i) => (
        <Pressable key={a.label} onPress={a.onPress} accessibilityRole="button" style={({ pressed }) => [i === 0 ? styles.actionMain : styles.actionAlt, pressed && { opacity: 0.8 }]}>
          <Text style={type(13, i === 0 ? "semibold" : "medium", { color: i === 0 ? colors.bg : colors.fg })}>{a.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function HooksCard({ card }: { card: Extract<AssistantCard, { type: "hooks" }> }) {
  const toast = useToast();
  const top = card.clips[0];
  return (
    <View style={styles.card}>
      <Text style={type(13, "semibold")}>{card.projectTitle}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {card.clips.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => router.push({ pathname: "/projects/[projectId]", params: { projectId: card.projectId, clip: c.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Open ${c.title}, ${formatDuration(c.durationSec)}${c.score != null ? `, virality score ${c.score}` : ""}`}
            style={styles.clip}
          >
            {c.thumbnailUrl ? <Image source={imageSource(c.thumbnailUrl)} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            {c.score != null ? (
              <View style={styles.clipScore}>
                <ScoreBadge score={c.score} compact />
              </View>
            ) : null}
            <View style={styles.clipTime}>
              <Text style={type(11, "regular", { mono: true })}>{formatDuration(c.durationSec)}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <Actions
        items={[
          { label: "Review clips", onPress: () => router.push({ pathname: "/projects/[projectId]", params: { projectId: card.projectId } }) },
          ...(top ? [{ label: "Change style", onPress: () => void startEdit({ from: "clip", clipId: top.id }).then((err) => err && toast(err, "error")) }] : []),
        ]}
      />
    </View>
  );
}

function CaptionCard({ card }: { card: Extract<AssistantCard, { type: "caption" }> }) {
  const toast = useToast();
  const full = [card.caption, card.hashtags.join(" ")].filter(Boolean).join("\n\n");
  return (
    <View style={styles.card}>
      <Text style={type(14, "regular", { lineHeight: 1.5 })} selectable>
        {card.caption}
      </Text>
      {card.hashtags.length ? <Text style={type(13, "medium", { color: colors.emeraldBright })}>{card.hashtags.join(" ")}</Text> : null}
      <Actions
        items={[
          {
            label: "Post it",
            onPress: () => {
              useComposerSeed.getState().seed({ clipId: card.clipId, caption: card.caption, hashtags: card.hashtags });
              router.push("/composer");
            },
          },
          { label: "Copy", onPress: () => void Clipboard.setStringAsync(full).then(() => toast("Caption copied.", "success")) },
        ]}
      />
    </View>
  );
}

const PROVIDER = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook" } as const;

function BestTimeCard({ card }: { card: Extract<AssistantCard, { type: "best_time" }> }) {
  const at = new Date(card.at);
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="clock" size={18} color={colors.emeraldBright} />
        <Text style={type(15, "semibold")}>
          {PROVIDER[card.provider]}: {card.label}
        </Text>
      </View>
      <Text style={textStyles.caption}>
        {card.source === "audience" ? "When your audience is most active." : "General guidance until your account has enough audience data."} Next:{" "}
        {at.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, {at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.
      </Text>
      <Actions
        items={[
          {
            label: "Schedule a post then",
            onPress: () => {
              useComposerSeed.getState().seed({ date: card.at });
              router.push("/composer");
            },
          },
        ]}
      />
    </View>
  );
}

function AutoClipCard({ card }: { card: Extract<AssistantCard, { type: "autoclip" }> }) {
  return (
    <View style={styles.card}>
      <Text style={type(14, "semibold")} numberOfLines={2}>
        {card.name}
      </Text>
      <Text style={textStyles.caption}>
        {card.estimatedMinutes ? `About ${card.estimatedMinutes} Clip Minutes. ` : ""}Nothing runs until you start it on the next screen.
      </Text>
      <Actions
        items={[
          {
            label: "Set up AutoClip",
            onPress: () => {
              useAutoClipDraft.getState().setSource({ kind: "asset", assetId: card.assetId, title: card.name, durationSec: card.durationSec ?? 60 });
              router.push("/create/autoclip");
            },
          },
        ]}
      />
    </View>
  );
}

function Typing({ label }: { label: string | null }) {
  return (
    <View style={[styles.aiRow, { alignItems: "center" }]} accessible accessibilityLabel={label ?? "Clipiro AI is typing"} accessibilityLiveRegion="polite">
      <AiAvatar />
      <View style={styles.dots}>
        {[colors.emeraldBright, colors.fgMuted, colors.fgSubtle].map((c) => (
          <View key={c} style={[styles.typingDot, { backgroundColor: c }]} />
        ))}
      </View>
      {label ? <Text style={textStyles.caption}>{label}</Text> : null}
    </View>
  );
}

const formatDuration = (sec: number) => {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** "Today · 6:42 PM", or the date for older chats. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const today = new Date().toDateString() === d.toDateString();
  return `${today ? "Today" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${time}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingBottom: 8 },
  thread: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 16 },
  center: { textAlign: "center" },
  userCol: { alignSelf: "flex-end", maxWidth: "78%", alignItems: "flex-end", gap: 4 },
  userBubble: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  retry: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44 },
  aiRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  aiAvatar: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.emerald, alignItems: "center", justifyContent: "center" },
  aiBody: { flex: 1, minWidth: 0, gap: 10 },
  card: { gap: 10, padding: 12, borderRadius: 14, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  clip: { width: 70, height: 124, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surface3 },
  clipScore: { position: "absolute", left: 4, top: 4 },
  clipTime: { position: "absolute", right: 6, bottom: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: derived.overlay },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionMain: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.emeraldBright, justifyContent: "center" },
  actionAlt: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    justifyContent: "center",
  },
  dots: { flexDirection: "row", gap: 4 },
  typingDot: { width: 7, height: 7, borderRadius: 4 },
  composer: { paddingTop: 10, paddingHorizontal: 16, gap: 10, backgroundColor: colors.bgDeep, borderTopWidth: 1, borderTopColor: colors.lineStrong },
  suggestion: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    justifyContent: "center",
  },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    ...type(14),
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderRadius: 24,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    paddingHorizontal: 18,
    paddingTop: 13,
    paddingBottom: 13,
    textAlignVertical: "center",
  },
  send: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
});
