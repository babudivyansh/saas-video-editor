import { ACCOUNT_PURGE_DAYS, LANGUAGES, type Settings } from "@clipiro/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  BottomSheet,
  Button,
  EmptyState,
  Icon,
  ListGroup,
  ListRow,
  OptionList,
  SkeletonCard,
  TextField,
  Toggle,
  useToast,
} from "@/components";
import { openPushSettings, usePush } from "@/lib/push";
import { useSession } from "@/state/session";
import { colors, type } from "@/theme";
import { deactivateAccount } from "@mocks/account";
import { errorMessage } from "@mocks/core";
import { useCaptionTemplates } from "../create/queries";
import { Label, Page } from "./bits";
import { useAccount, useSaveSettings, useSettings } from "./queries";

const ASPECTS = [
  { value: "9:16", label: "9:16", detail: "Vertical · Shorts, Reels, TikTok" },
  { value: "16:9", label: "16:9", detail: "Landscape · YouTube" },
  { value: "1:1", label: "1:1", detail: "Square · feeds" },
] as const;

/** Security pages live in the web's Settings for now (?settings=<section>). */
const web = (section: string) => () =>
  Linking.openURL(`https://clipiro.com/dashboard?settings=${section}`);

type Picker = "language" | "aspect" | "caption" | null;

// design/screens/BN-Settings.
export function SettingsScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const settings = useSettings();
  const account = useAccount();
  const push = usePush();
  const templates = useCaptionTemplates();
  const save = useSaveSettings((e) => toast(errorMessage(e), "error"));
  const [picker, setPicker] = useState<Picker>(null);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const s = settings.data;
  const set = (patch: Partial<Settings>) => save.mutate(patch);
  const free = account.data?.plan.tier === "free";

  const deleteAccount = async () => {
    setBusy(true);
    try {
      await deactivateAccount(password);
      setDeleting(false);
      qc.clear();
      useSession.getState().signOut();
    } catch (e) {
      setPwError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (
    title: string,
    value: boolean,
    onChange: (v: boolean) => void,
    subtitle?: string,
    first = false
  ) => (
    <ListRow
      first={first}
      title={title}
      subtitle={subtitle}
      trailing={<Toggle value={value} onValueChange={onChange} accessibilityLabel={title} />}
    />
  );

  return (
    <Page title="Settings" onRefresh={() => settings.refetch()}>
      {settings.isPending ? (
        <>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
        </>
      ) : settings.isError || !s ? (
        <EmptyState
          tone="error"
          title="Couldn’t load your settings"
          body={errorMessage(settings.error)}
          action={{ label: "Try again", onPress: () => settings.refetch() }}
        />
      ) : (
        <>
          <Label>General</Label>
          <ListGroup>
            <ListRow
              first
              title="Language"
              onPress={() => setPicker("language")}
              trailing={
                <Value text={LANGUAGES.find((l) => l.code === s.language)?.name ?? "English"} />
              }
            />
            <ListRow
              title="Default aspect ratio"
              onPress={() => setPicker("aspect")}
              trailing={<Value text={s.aspectRatio} />}
            />
            <ListRow
              title="Default caption style"
              onPress={() => setPicker("caption")}
              trailing={
                <Value
                  text={templates.data?.find((t) => t.id === s.captionTemplateId)?.name ?? "—"}
                />
              }
            />
            <ListRow
              title="Export quality"
              subtitle="Set by your plan"
              trailing={
                <Text style={type(14, "regular", { color: colors.fgMuted })}>
                  {free ? "720p" : "1080p"}
                </Text>
              }
            />
          </ListGroup>

          <Label>Preferences</Label>
          <ListGroup>
            {toggle("Autoplay previews", s.autoplay, (v) => set({ autoplay: v }), undefined, true)}
            {toggle("Haptic feedback", s.haptics, (v) => set({ haptics: v }))}
            {toggle(
              "Upload on Wi-Fi only",
              s.wifiOnlyUploads,
              (v) => set({ wifiOnlyUploads: v }),
              "Save mobile data"
            )}
          </ListGroup>

          <Label>Notifications</Label>
          <ListGroup>
            {toggle(
              "Render finished",
              push.prefs.renderFinished,
              (v) => void push.setPrefs({ renderFinished: v }),
              "Push · when clips are ready",
              true
            )}
            {toggle(
              "Posts",
              push.prefs.postPublished,
              (v) => void push.setPrefs({ postPublished: v }),
              "Push · posted, failed, or your turn to post"
            )}
            {toggle(
              "Weekly summary",
              s.email.weeklySummary,
              (v) => set({ email: { ...s.email, weeklySummary: v } }),
              "Email"
            )}
            {toggle(
              "Product news",
              s.email.productUpdates,
              (v) => set({ email: { ...s.email, productUpdates: v } }),
              "Email"
            )}
          </ListGroup>
          {push.permission === "denied" ? (
            <Text style={[type(12, "regular", { color: colors.fgSubtle, lineHeight: 1.45 }), styles.note]}>
              Notifications are off for Clipiro in Android settings.{" "}
              <Text style={{ color: colors.emeraldBright }} onPress={openPushSettings} accessibilityRole="link">
                Turn them on
              </Text>
            </Text>
          ) : push.permission === "unavailable" ? (
            <Text style={[type(12, "regular", { color: colors.fgSubtle, lineHeight: 1.45 }), styles.note]}>
              Push notifications aren’t available in this build of the app.
            </Text>
          ) : null}
        </>
      )}

      <Label>Security & privacy</Label>
      <ListGroup>
        <ListRow
          first
          title="Password"
          onPress={web("security")}
          accessibilityLabel="Password, opens clipiro.com"
        />
        <ListRow
          title="Sessions"
          onPress={web("sessions")}
          accessibilityLabel={`Sessions, ${account.data?.activeSessions ?? ""} devices, opens clipiro.com`}
          trailing={
            account.data ? (
              <Value
                text={`${account.data.activeSessions} device${account.data.activeSessions === 1 ? "" : "s"}`}
              />
            ) : undefined
          }
        />
        <ListRow
          title="Privacy"
          onPress={web("privacy")}
          accessibilityLabel="Privacy, opens clipiro.com"
        />
        <ListRow
          title="API keys"
          onPress={web("api-keys")}
          accessibilityLabel="API keys, opens clipiro.com"
        />
      </ListGroup>

      <Label>Danger zone</Label>
      <ListGroup>
        <ListRow
          first
          destructive
          title="Delete account"
          onPress={() => {
            setPassword("");
            setPwError(undefined);
            setDeleting(true);
          }}
          trailing={<View />}
        />
      </ListGroup>

      <BottomSheet visible={picker === "language"} onClose={() => setPicker(null)} title="Language">
        <ScrollView style={{ maxHeight: 440 }}>
          <OptionList
            accessibilityLabel="Language"
            value={s?.language ?? null}
            options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))}
            onChange={(v) => (setPicker(null), set({ language: v }))}
          />
        </ScrollView>
      </BottomSheet>
      <BottomSheet
        visible={picker === "aspect"}
        onClose={() => setPicker(null)}
        title="Default aspect ratio"
      >
        <OptionList
          accessibilityLabel="Default aspect ratio"
          value={s?.aspectRatio ?? null}
          options={ASPECTS}
          onChange={(v) => (setPicker(null), set({ aspectRatio: v }))}
        />
      </BottomSheet>
      <BottomSheet
        visible={picker === "caption"}
        onClose={() => setPicker(null)}
        title="Default caption style"
      >
        <ScrollView style={{ maxHeight: 440 }}>
          <OptionList
            accessibilityLabel="Default caption style"
            value={s?.captionTemplateId ?? null}
            options={(templates.data ?? []).map((t) => ({
              value: t.id,
              label: t.name,
              trailing: t.premium ? "Premium" : undefined,
            }))}
            onChange={(v) => (setPicker(null), set({ captionTemplateId: v }))}
          />
        </ScrollView>
      </BottomSheet>

      <BottomSheet
        visible={deleting}
        onClose={() => setDeleting(false)}
        title="Delete your account?"
      >
        <Text style={type(14, "regular", { color: colors.fgMuted, lineHeight: 1.5 })}>
          Your account is switched off now and deleted for good after {ACCOUNT_PURGE_DAYS} days,
          with your projects, clips and assets. Log back in before then to keep it. A paid plan is
          cancelled.
        </Text>
        <TextField
          label="Password"
          value={password}
          onChangeText={(t) => (setPassword(t), setPwError(undefined))}
          error={pwError}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
        />
        <Button
          label="Delete account"
          variant="danger"
          size="sm"
          fullWidth
          loading={busy}
          disabled={!password}
          onPress={deleteAccount}
        />
      </BottomSheet>
    </Page>
  );
}

function Value({ text }: { text: string }) {
  return (
    <View style={styles.value}>
      <Text style={type(14, "regular", { color: colors.fgMuted })} numberOfLines={1}>
        {text}
      </Text>
      <Icon name="chevronRight" size={16} color={colors.fgSubtle} />
    </View>
  );
}

const styles = StyleSheet.create({
  value: { flexDirection: "row", alignItems: "center", gap: 8, maxWidth: "55%" },
  note: { paddingHorizontal: 4 },
});
