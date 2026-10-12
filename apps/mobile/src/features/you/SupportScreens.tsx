import { SUPPORT_TOPICS, contactRequest } from "@clipiro/shared";
import Constants from "expo-constants";
import { useMemo, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import {
  BottomSheet,
  BrandMark,
  Button,
  Icon,
  ListGroup,
  ListRow,
  OptionList,
  TextField,
  useToast,
  type IconName,
} from "@/components";
import { me } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { colors, radius, text, type } from "@/theme";
import { IconChip, Label, Page } from "./bits";

const SUPPORT_EMAIL = "support@clipiro.com";
const DISCORD_URL = "https://discord.gg/F7jftK3fxe";
const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";

// ── Help & Support (design/screens/BN-Help) ───────────────────────────────

type Topic = "credits" | "autoclip" | "editor" | "social" | "billing" | "account";
const TOPICS: { id: Topic; label: string; icon: IconName }[] = [
  { id: "credits", label: "Credits", icon: "bolt" },
  { id: "autoclip", label: "AutoClip", icon: "scissors" },
  { id: "editor", label: "Editor", icon: "film" },
  { id: "social", label: "Social", icon: "social" },
  { id: "billing", label: "Billing", icon: "card" },
  { id: "account", label: "Account", icon: "shield" },
];

// Answers follow the web's help centre (app/help/articles.ts) and policies.
const FAQ: { topic: Topic; q: string; a: string }[] = [
  {
    topic: "credits",
    q: "What is a credit?",
    a: "Credits pay for AI tools. Each tool shows its price before you run it, like 2–10 credits for an image or 1 credit per 500 characters of voiceover.",
  },
  {
    topic: "credits",
    q: "Do credits expire?",
    a: "Bonus credits expire after 30 days. Subscription credits roll over up to twice your monthly allowance. Pack credits never expire while your account is active.",
  },
  {
    topic: "billing",
    q: "Can I cancel anytime?",
    a: "Yes. Your plan stays active until the end of the period you paid for, then you move to the Free plan.",
  },
  {
    topic: "billing",
    q: "Do you offer refunds?",
    a: "Yes, within 3 days of a purchase if you haven’t used what you bought. Failed jobs are refunded automatically. Approved refunds take 1–3 business days on UPI and 5–10 on cards.",
  },
  {
    topic: "account",
    q: "Can I use clips commercially?",
    a: "Yes. Every plan includes a commercial license for what you make.",
  },
  {
    topic: "autoclip",
    q: "How do Clip Minutes work?",
    a: "AutoClip uses 1 Clip Minute per minute of video you upload, however many clips it makes. Re-running the same video within 7 days is free, and a run that fails is refunded in full.",
  },
  {
    topic: "editor",
    q: "What quality are exports?",
    a: "Paid plans export in 1080p without a watermark. Free exports are 720p with a watermark.",
  },
  {
    topic: "social",
    q: "Where can I post?",
    a: "Clipiro posts to YouTube for you, now or at a time you pick. For Instagram and Facebook, we remind you when it’s time, copy the caption, and you share the video and paste the link back so its numbers show in Insights.",
  },
  {
    topic: "account",
    q: "How do I turn on two-factor authentication?",
    a: "In Settings → Security on clipiro.com, scan the QR code with an authenticator app and confirm with a code. Keep your recovery codes somewhere safe.",
  },
];

/** A message to the team, sent as the signed-in account (POST /support/contact). */
function ContactSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const toast = useToast();
  const [subject, setSubject] = useState<(typeof SUPPORT_TOPICS)[number]["id"]>("support");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const parsed = contactRequest.safeParse({ subject, message });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    setBusy(true);
    try {
      await me.contact(parsed.data);
      setMessage("");
      onClose();
      toast("Sent. We’ll reply to your account’s email.", "success");
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Message us">
      <OptionList accessibilityLabel="What it’s about" value={subject} options={SUPPORT_TOPICS.map((t) => ({ value: t.id, label: t.label }))} onChange={setSubject} />
      <TextField
        label="Message"
        value={message}
        onChangeText={(t) => (setMessage(t), setError(undefined))}
        placeholder="What happened, and what you expected"
        multiline
        error={error}
      />
      <Button label="Send" size="sm" fullWidth loading={busy} onPress={send} />
    </BottomSheet>
  );
}

export function HelpScreen() {
  const [contact, setContact] = useState(false);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<Topic | null>(null);
  const [open, setOpen] = useState<string | null>(FAQ[0]!.q);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQ.filter(
      (f) =>
        (!topic || f.topic === topic) &&
        (!q || f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q))
    );
  }, [query, topic]);

  const bug = () => {
    const body = `What happened?\n\n\nWhat did you expect?\n\n\n— Clipiro for Android ${APP_VERSION} · Android ${Platform.Version}`;
    Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Bug report · Android ${APP_VERSION}`)}&body=${encodeURIComponent(body)}`
    );
  };

  return (
    <Page title="Help & Support">
      <TextField
        label="Search help articles"
        hideLabel
        leadingIcon="search"
        placeholder="Search help articles"
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
      />
      <View style={styles.topics}>
        {TOPICS.map((t) => {
          const on = topic === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTopic(on ? null : t.id)}
              accessibilityRole="button"
              aria-selected={on}
              accessibilityLabel={`${t.label} questions`}
              style={({ pressed }) => [
                styles.topic,
                on && styles.topicOn,
                pressed && { backgroundColor: colors.surface3 },
              ]}
            >
              <Icon name={t.icon} size={20} color={colors.emeraldBright} />
              <Text style={type(13, "semibold")}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Label>Questions</Label>
      {shown.length === 0 ? (
        <Text style={[text.caption, { paddingVertical: 8 }]}>
          No answers match that. Email us and we’ll help.
        </Text>
      ) : (
        <View style={styles.faq}>
          {shown.map((f, i) => {
            const expanded = open === f.q;
            return (
              <View key={f.q} style={i > 0 && styles.divider}>
                <Pressable
                  onPress={() => setOpen(expanded ? null : f.q)}
                  accessibilityRole="button"
                  aria-expanded={expanded}
                  accessibilityLabel={f.q}
                  style={styles.question}
                >
                  <Text style={[type(15, "bold"), { flex: 1 }]}>{f.q}</Text>
                  <Icon
                    name={expanded ? "close" : "chevronDown"}
                    size={16}
                    color={expanded ? colors.emeraldBright : colors.fgMuted}
                  />
                </Pressable>
                {expanded ? (
                  <Text
                    style={[
                      type(14, "regular", { color: colors.fgMuted, lineHeight: 1.5 }),
                      styles.answer,
                    ]}
                  >
                    {f.a}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      <Label>Contact us</Label>
      <ListGroup>
        <ListRow
          first
          leading={<IconChip name="chat" />}
          title="Message us"
          subtitle="We reply by email, usually within a day"
          onPress={() => setContact(true)}
        />
        <ListRow
          leading={<IconChip name="mail" />}
          title="Email support"
          subtitle={SUPPORT_EMAIL}
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
        />
        <ListRow
          leading={<IconChip name="chat" />}
          title="Join the Discord"
          subtitle="Ask the community"
          onPress={() => Linking.openURL(DISCORD_URL)}
        />
        <ListRow
          leading={<IconChip name="alert" color={colors.warning} />}
          title="Report a bug"
          subtitle="Opens an email with your app version"
          onPress={bug}
        />
      </ListGroup>
      <ContactSheet visible={contact} onClose={() => setContact(false)} />
    </Page>
  );
}

// ── Legal (design/screens/BN-Legal) ───────────────────────────────────────

// Dates from the web's app/legal/documents.ts.
const DOCS: { title: string; detail: string; path: string; icon: IconName }[] = [
  {
    title: "Terms of Service",
    detail: "Updated Sep 27, 2026 · commercial use included",
    path: "/terms",
    icon: "file",
  },
  { title: "Privacy Policy", detail: "Updated Jun 28, 2026", path: "/privacy", icon: "shield" },
  {
    title: "Refund Policy",
    detail: "3-day money-back · updated Sep 27, 2026",
    path: "/refund",
    icon: "card",
  },
  {
    title: "Affiliate Terms",
    detail: "Updated Jun 14, 2026",
    path: "/affiliate-tos",
    icon: "check",
  },
  { title: "Cookie Policy", detail: "Updated Jun 28, 2026", path: "/cookies", icon: "eye" },
];

// The app's main open-source building blocks (full notices ship with the store build).
const LICENSES = [
  ["Expo & Expo Router", "MIT"],
  ["React & React Native", "MIT"],
  ["TanStack Query", "MIT"],
  ["Zustand", "MIT"],
  ["Zod", "MIT"],
  ["react-native-svg", "MIT"],
  ["Geist & Geist Mono fonts", "SIL Open Font License 1.1"],
] as const;

export function LegalScreen() {
  const [licenses, setLicenses] = useState(false);
  return (
    <Page title="Legal">
      <ListGroup>
        {DOCS.map((d, i) => (
          <ListRow
            key={d.path}
            first={i === 0}
            leading={<IconChip name={d.icon} />}
            title={d.title}
            subtitle={d.detail}
            onPress={() => Linking.openURL(`https://clipiro.com${d.path}`)}
          />
        ))}
        <ListRow
          leading={<IconChip name="code" />}
          title="Open-source licenses"
          onPress={() => setLicenses(true)}
        />
      </ListGroup>
      <View style={styles.footer}>
        <BrandMark />
        <Text style={type(12, "regular", { mono: true, color: colors.fgMuted })}>
          Clipiro for Android · v{APP_VERSION}
        </Text>
        <Text style={text.caption}>© 2026 Clipiro</Text>
      </View>
      <BottomSheet
        visible={licenses}
        onClose={() => setLicenses(false)}
        title="Open-source licenses"
      >
        {LICENSES.map(([name, license]) => (
          <View key={name} style={styles.license} accessible>
            <Text style={[type(14, "semibold"), { flex: 1 }]}>{name}</Text>
            <Text style={type(12, "regular", { color: colors.fgMuted })}>{license}</Text>
          </View>
        ))}
      </BottomSheet>
    </Page>
  );
}

const styles = StyleSheet.create({
  topics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  topic: {
    flexBasis: "30%",
    flexGrow: 1,
    minHeight: 84,
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.tile,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  topicOn: { backgroundColor: colors.tint, borderColor: colors.emeraldBright },
  faq: {
    borderRadius: radius.card,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  question: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 16,
  },
  answer: { paddingHorizontal: 16, paddingBottom: 16 },
  footer: { alignItems: "center", gap: 8, paddingVertical: 28 },
  license: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
});
