import { assistantSendRequest, type AssistantMessage } from "@clipiro/shared";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CreditsPill, EmptyState, Header, Icon, IconButton, ScoreBadge, SkeletonCard, useToast } from "@/components";
import { imageSource } from "@/lib/images";
import { colors, derived, radius, type } from "@/theme";
import { ASSISTANT_SUGGESTIONS, sendAssistantMessage } from "@mocks/home";
import { errorMessage } from "@mocks/core";
import { useAssistantHistory, useHomeSummary } from "./queries";
import { COMING_SOON } from "./tools";

type Local = AssistantMessage & { status?: "sending" | "failed" };

// design/screens/BN-Assistant.html — full-screen chat with Clipiro AI.
// There is no assistant API yet (none on the web either): replies come from
// the mock until one is built.
export function AssistantScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const history = useAssistantHistory();
  const minutes = useHomeSummary().data?.clipMinutes.remaining;
  const [local, setLocal] = useState<Local[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const seq = useRef(0);

  const messages: Local[] = [...(history.data ?? []), ...local];

  const send = async (raw: string, retryId?: string) => {
    const parsed = assistantSendRequest.safeParse({ text: raw });
    if (!parsed.success || thinking) return;
    const id = retryId ?? `local_${++seq.current}`;
    setLocal((m) =>
      retryId
        ? m.map((x) => (x.id === id ? { ...x, status: "sending" } : x))
        : [...m, { id, role: "user", text: parsed.data.text, createdAt: new Date().toISOString(), status: "sending" }],
    );
    if (!retryId) setDraft("");
    setThinking(true);
    try {
      const reply = await sendAssistantMessage(parsed.data);
      setLocal((m) => [...m.map((x) => (x.id === id ? { ...x, status: undefined } : x)), reply]);
    } catch (e) {
      setLocal((m) => m.map((x) => (x.id === id ? { ...x, status: "failed" } : x)));
      toast(errorMessage(e), "error");
    } finally {
      setThinking(false);
    }
  };

  const onAction = (actionId: string) => {
    if (actionId === "review-clips") router.push("/projects/videos-reels-shorts");
    else send("Change the caption style");
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Header
          title="Clipiro AI"
          subtitle="Your creative assistant"
          onBack={() => (router.canGoBack() ? router.back() : router.replace("/home"))}
          actions={minutes != null ? <CreditsPill amount={minutes} onPress={() => router.push("/you/credits")} /> : null}
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
          <EmptyState tone="error" title="Couldn’t load the conversation" body={errorMessage(history.error)} action={{ label: "Try again", onPress: () => history.refetch() }} />
        ) : messages.length === 0 ? (
          <EmptyState icon="sparkle" title="What are we making today?" body="Ask for hooks, captions, posting times or clip ideas." />
        ) : (
          <>
            <Text style={[type(11, "regular", { color: colors.fgSubtle }), styles.center]}>{dayLabel(messages[0]?.createdAt ?? "")}</Text>
            {messages.map((m) =>
              m.role === "user" ? (
                <UserBubble key={m.id} m={m} onRetry={() => send(m.text, m.id)} />
              ) : (
                <AssistantTurn key={m.id} m={m} onAction={onAction} />
              ),
            )}
          </>
        )}
        {thinking ? <Typing /> : null}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: insets.bottom + 12 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
          {ASSISTANT_SUGGESTIONS.map((s) => (
            <Pressable
              key={s}
              onPress={() => send(s)}
              accessibilityRole="button"
              accessibilityHint="Sends this message"
              style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: colors.surface3 }]}
            >
              <Text style={type(12)} numberOfLines={1}>
                {s}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.inputRow}>
          <IconButton icon="plus" accessibilityLabel="Attach video or file" onPress={() => toast(COMING_SOON, "info")} />
          <View style={styles.inputWrap}>
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
              onPress={() => toast("Voice input is coming soon.", "info")}
              accessibilityRole="button"
              accessibilityLabel="Voice input"
              style={styles.mic}
            >
              <Icon name="mic" size={20} color={colors.fgMuted} />
            </Pressable>
          </View>
          <Pressable
            onPress={() => send(draft)}
            disabled={!draft.trim() || thinking}
            accessibilityRole="button"
            accessibilityLabel="Send"
            aria-disabled={!draft.trim() || thinking}
            style={({ pressed }) => [styles.send, (!draft.trim() || thinking) && { opacity: 0.5 }, pressed && { backgroundColor: colors.primaryPress }]}
          >
            <Icon name="arrowRight" size={20} color={colors.onPrimary} strokeWidth={2.4} />
          </Pressable>
        </View>
      </View>
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

function AssistantTurn({ m, onAction }: { m: Local; onAction: (id: string) => void }) {
  return (
    <View style={styles.aiRow}>
      <AiAvatar />
      <View style={styles.aiBody}>
        <Text style={type(14, "regular", { lineHeight: 1.55 })} accessibilityLabel={`Clipiro AI: ${m.text.replace(/\*\*/g, "")}`}>
          {m.text.split("**").map((part, i) =>
            i % 2 ? (
              <Text key={i} style={type(14, "semibold")}>
                {part}
              </Text>
            ) : (
              part
            ),
          )}
        </Text>
        {m.clips?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {m.clips.map((c) => (
              <View key={c.id} style={styles.clip} accessible accessibilityLabel={`Clip, ${formatDuration(c.durationSec)}, virality score ${c.score}`}>
                <Image source={imageSource(c.thumbnailUrl)} style={StyleSheet.absoluteFill} contentFit="cover" />
                <View style={styles.clipScore}>
                  <ScoreBadge score={c.score} compact />
                </View>
                <View style={styles.clipTime}>
                  <Text style={type(11, "regular", { mono: true })}>{formatDuration(c.durationSec)}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        ) : null}
        {m.checklist?.length ? (
          <View style={styles.checklist}>
            {m.checklist.map((item) => (
              <View key={item} style={styles.checkRow}>
                <Icon name="check" size={16} color={colors.emeraldBright} strokeWidth={2.2} />
                <Text style={[type(13), { flex: 1 }]}>{item}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {m.actions?.length ? (
          <View style={styles.actions}>
            {m.actions.map((a, i) => (
              <Pressable
                key={a.id}
                onPress={() => onAction(a.id)}
                accessibilityRole="button"
                style={({ pressed }) => [i === 0 ? styles.actionMain : styles.actionAlt, pressed && { opacity: 0.8 }]}
              >
                <Text style={type(13, i === 0 ? "semibold" : "medium", { color: i === 0 ? colors.bg : colors.fg })}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Typing() {
  return (
    <View style={[styles.aiRow, { alignItems: "center" }]} accessible accessibilityLabel="Clipiro AI is typing" accessibilityLiveRegion="polite">
      <AiAvatar />
      <View style={styles.dots}>
        {[colors.emeraldBright, colors.fgMuted, colors.fgSubtle].map((c) => (
          <View key={c} style={[styles.typingDot, { backgroundColor: c }]} />
        ))}
      </View>
    </View>
  );
}

const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

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
  clip: { width: 70, height: 124, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surface3 },
  clipScore: { position: "absolute", left: 4, top: 4 },
  clipTime: { position: "absolute", right: 6, bottom: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: derived.overlay },
  checklist: { gap: 6, padding: 12, borderRadius: 14, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
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
  inputWrap: { flex: 1, justifyContent: "center" },
  input: {
    ...type(14),
    minHeight: 48,
    maxHeight: 120,
    borderRadius: 24,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    paddingLeft: 18,
    paddingRight: 48,
    paddingTop: 13,
    paddingBottom: 13,
    textAlignVertical: "center",
  },
  mic: { position: "absolute", right: 2, bottom: 2, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  send: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
});

