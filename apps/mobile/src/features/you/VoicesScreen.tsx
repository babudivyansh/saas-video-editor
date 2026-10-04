import {
  CLONE_SAMPLE_SECONDS,
  MAX_CLONED_VOICES,
  type ClonedVoice,
  type LibraryVoice,
} from "@clipiro/shared";
import { useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  Avatar,
  BottomSheet,
  Button,
  Checkbox,
  ConfirmSheet,
  EmptyState,
  Icon,
  SkeletonCard,
  TextField,
  useToast,
} from "@/components";
import { imageSource } from "@/lib/images";
import { colors, radius, text, type } from "@/theme";
import { cloneVoice, deleteVoice, renameVoice } from "@mocks/account";
import { errorMessage } from "@mocks/core";
import { Label, Page } from "./bits";
import { useAccount, useClonedVoices, useVoiceLibrary, youKeys } from "./queries";

const SHOWN = 4;
const GENDER: Record<LibraryVoice["gender"], string> = {
  male: "Male",
  female: "Female",
  neutral: "Neutral",
};
const PREVIEW_SOON = "Voice previews play once audio playback arrives in the app.";
const openVoiceover = (id: string) =>
  router.push({ pathname: "/create/ai-media", params: { tab: "voiceover", voice: id } });

// design/screens/BN-Voices.
export function VoicesScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const account = useAccount();
  const clones = useClonedVoices();
  const library = useVoiceLibrary();
  const [renaming, setRenaming] = useState<ClonedVoice | null>(null);
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [deleting, setDeleting] = useState<ClonedVoice | null>(null);
  const [recording, setRecording] = useState(false);
  const [sample, setSample] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [busy, setBusy] = useState(false);

  const count = clones.data?.length ?? 0;
  const full = count >= MAX_CLONED_VOICES;
  const refresh = () => qc.invalidateQueries({ queryKey: youKeys.clones });

  const run = async (fn: () => Promise<unknown>, done: string, onFail?: (e: unknown) => void) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      toast(done, "success");
      return true;
    } catch (e) {
      if (onFail) onFail(e);
      else toast(errorMessage(e), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const pickSample = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: "audio/*",
      copyToCacheDirectory: false,
    });
    if (res.canceled || !res.assets[0]) return;
    setSample(res.assets[0].name);
    setNewName("");
    setNameError(undefined);
    setConsent(false);
  };

  return (
    <Page title="My Voices" onRefresh={() => Promise.all([clones.refetch(), library.refetch()])}>
      {clones.isPending ? (
        <SkeletonCard lines={2} />
      ) : clones.isError ? (
        <EmptyState
          tone="error"
          title="Couldn’t load your voices"
          body={errorMessage(clones.error)}
          action={{ label: "Try again", onPress: () => clones.refetch() }}
        />
      ) : (
        clones.data.map((v) => (
          <View key={v.id} style={[styles.clone, v.isDefault && styles.cloneOn]}>
            <View style={styles.cloneHead}>
              <Avatar
                name={v.name}
                source={
                  account.data?.user.avatarUrl ? imageSource(account.data.user.avatarUrl) : null
                }
                size={44}
                decorative
              />
              <View style={{ flex: 1 }}>
                <Text style={type(16, "bold")} numberOfLines={1}>
                  {v.name}
                </Text>
                <Text style={type(12, "regular", { color: colors.fgMuted })}>
                  Cloned voice{v.isDefault ? " · default" : ""}
                </Text>
              </View>
              <Bars color={colors.emeraldBright} />
              <PlayButton label={`Play ${v.name}`} onPress={() => toast(PREVIEW_SOON, "info")} />
            </View>
            <View style={styles.cloneActions}>
              <Button
                label="Rename"
                variant="secondary"
                size="md"
                style={{ flex: 1 }}
                accessibilityLabel={`Rename ${v.name}`}
                onPress={() => {
                  setRenaming(v);
                  setNewName(v.name);
                  setNameError(undefined);
                }}
              />
              <Button
                label="Use in voiceover"
                variant="secondary"
                size="md"
                style={{ flex: 1.4 }}
                onPress={() =>
                  toast("Using your cloned voice in voiceovers is coming soon.", "info")
                }
              />
            </View>
          </View>
        ))
      )}

      <View style={styles.cloneNew}>
        <View style={styles.micTile}>
          <Icon name="mic" size={22} color={colors.emeraldBright} />
        </View>
        <Text style={[type(18, "bold"), { textAlign: "center" }]}>Clone a new voice</Text>
        <Text
          style={[
            type(14, "regular", { color: colors.fgMuted, lineHeight: 1.45 }),
            { textAlign: "center" },
          ]}
        >
          {full
            ? `You’ve used all ${MAX_CLONED_VOICES} voice slots. Delete one to clone another.`
            : `Record or upload ${CLONE_SAMPLE_SECONDS} seconds of clean speech. Only you can use your cloned voices.`}
        </Text>
        <View style={styles.cloneActions}>
          <Button
            label="Record"
            icon="mic"
            variant="secondary"
            size="md"
            style={{ flex: 1 }}
            disabled={full || !clones.data}
            onPress={() => setRecording(true)}
          />
          <Button
            label="Upload"
            icon="upload"
            variant="secondary"
            size="md"
            style={{ flex: 1 }}
            disabled={full || !clones.data}
            onPress={pickSample}
          />
        </View>
        {clones.data ? (
          <Text style={text.caption}>{`${count} of ${MAX_CLONED_VOICES} cloned voices`}</Text>
        ) : null}
      </View>

      <View style={styles.libraryHead}>
        <Label>
          {library.data ? `Voice library · ${library.data.length} narrators` : "Voice library"}
        </Label>
        {library.data && library.data.length > SHOWN ? (
          <Pressable
            onPress={() => setBrowsing(true)}
            accessibilityRole="button"
            style={styles.link}
          >
            <Text style={type(13, "semibold", { color: colors.emeraldBright })}>Browse all</Text>
          </Pressable>
        ) : null}
      </View>
      {library.isPending ? (
        <SkeletonCard lines={4} />
      ) : library.isError ? (
        <EmptyState
          tone="error"
          title="Couldn’t load the voice library"
          body={errorMessage(library.error)}
          action={{ label: "Try again", onPress: () => library.refetch() }}
        />
      ) : (
        <View style={styles.list}>
          {library.data.slice(0, SHOWN).map((v, i) => (
            <LibraryRow
              key={v.id}
              v={v}
              first={i === 0}
              onPlay={() => toast(PREVIEW_SOON, "info")}
            />
          ))}
        </View>
      )}

      <BottomSheet visible={browsing} onClose={() => setBrowsing(false)} title="Voice library">
        <ScrollView style={{ maxHeight: 460 }}>
          <View style={styles.list}>
            {(library.data ?? []).map((v, i) => (
              <LibraryRow
                key={v.id}
                v={v}
                first={i === 0}
                onPlay={() => toast(PREVIEW_SOON, "info")}
                onUse={() => setBrowsing(false)}
              />
            ))}
          </View>
        </ScrollView>
      </BottomSheet>

      <BottomSheet visible={!!renaming} onClose={() => setRenaming(null)} title="Rename voice">
        <TextField
          label="Voice name"
          value={newName}
          onChangeText={(t) => (setNewName(t), setNameError(undefined))}
          error={nameError}
        />
        <Button
          label="Save"
          size="sm"
          fullWidth
          loading={busy}
          onPress={async () => {
            if (
              renaming &&
              (await run(
                () => renameVoice(renaming.id, newName),
                "Voice renamed.",
                (e) => setNameError(errorMessage(e))
              ))
            )
              setRenaming(null);
          }}
        />
        <Button
          label="Delete voice"
          variant="danger"
          size="sm"
          fullWidth
          onPress={() => (setDeleting(renaming), setRenaming(null))}
        />
      </BottomSheet>

      <ConfirmSheet
        visible={!!deleting}
        title={`Delete ${deleting?.name ?? "this voice"}?`}
        body="Voiceovers you already made keep their audio. You can’t use this voice again unless you clone it again."
        confirmLabel="Delete"
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const v = deleting;
          if (v && (await run(() => deleteVoice(v.id), "Voice deleted."))) setDeleting(null);
        }}
      />

      <BottomSheet visible={recording} onClose={() => setRecording(false)} title="Record a sample">
        <Text style={type(14, "regular", { color: colors.fgMuted, lineHeight: 1.5 })}>
          Recording in the app is coming soon. You can upload a recording of {CLONE_SAMPLE_SECONDS}{" "}
          seconds or more now.
        </Text>
        <Button
          label="Upload a recording"
          size="sm"
          fullWidth
          icon="upload"
          onPress={() => (setRecording(false), pickSample())}
        />
      </BottomSheet>

      <BottomSheet visible={!!sample} onClose={() => setSample(null)} title="Name your voice">
        <View style={styles.sample}>
          <Icon name="waveform" size={18} color={colors.emeraldBright} />
          <Text style={[type(13, "medium"), { flex: 1 }]} numberOfLines={1}>
            {sample}
          </Text>
        </View>
        <TextField
          label="Voice name"
          value={newName}
          onChangeText={(t) => (setNewName(t), setNameError(undefined))}
          error={nameError}
          placeholder="Maya — energetic"
        />
        <Checkbox
          checked={consent}
          onChange={setConsent}
          label="This is my voice, or I have permission to clone it."
        />
        <Button
          label="Clone voice"
          size="sm"
          fullWidth
          loading={busy}
          disabled={!consent}
          onPress={async () => {
            if (
              await run(
                () => cloneVoice(newName, "upload"),
                "Voice cloned.",
                (e) => setNameError(errorMessage(e))
              )
            )
              setSample(null);
          }}
        />
      </BottomSheet>
    </Page>
  );
}

function LibraryRow({
  v,
  first,
  onPlay,
  onUse,
}: {
  v: LibraryVoice;
  first: boolean;
  onPlay: () => void;
  onUse?: () => void;
}) {
  return (
    <View style={[styles.voice, !first && styles.divider]}>
      <Avatar name={v.name} size={40} decorative />
      <View style={{ flex: 1 }}>
        <Text style={type(15, "bold")} numberOfLines={1}>
          {v.name}
        </Text>
        <Text style={type(12, "regular", { color: colors.fgMuted })} numberOfLines={2}>
          {GENDER[v.gender]} · {v.description}
        </Text>
      </View>
      <PlayButton label={`Play ${v.name}`} onPress={onPlay} />
      <Pressable
        onPress={() => {
          onUse?.();
          openVoiceover(v.id);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Use ${v.name}`}
        style={({ pressed }) => [styles.use, pressed && { backgroundColor: colors.surface3 }]}
      >
        <Text style={type(13, "semibold")}>Use</Text>
      </Pressable>
    </View>
  );
}

function PlayButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.play, pressed && { backgroundColor: colors.primaryPress }]}
    >
      <Icon name="play" size={14} color={colors.onPrimary} filled />
    </Pressable>
  );
}

// Decorative waveform (design: a cloned voice's card).
const BAR_HEIGHTS = [6, 12, 8, 16, 10, 18, 9, 14, 7, 12, 16, 8];
function Bars({ color }: { color: string }) {
  return (
    <View style={styles.bars} importantForAccessibility="no-hide-descendants">
      {BAR_HEIGHTS.map((h, i) => (
        <View key={i} style={[styles.bar, { height: h, backgroundColor: color }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  clone: {
    gap: 12,
    padding: 14,
    borderRadius: radius.card,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cloneOn: { backgroundColor: colors.tint, borderColor: colors.tintBorder },
  cloneHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  cloneActions: { flexDirection: "row", gap: 10, alignSelf: "stretch" },
  cloneNew: {
    alignItems: "center",
    gap: 10,
    padding: 20,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.tintBorder,
  },
  micTile: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.tint,
  },
  libraryHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  link: { minHeight: 44, justifyContent: "center", paddingLeft: 10 },
  list: {
    borderRadius: radius.card,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  voice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 72,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  play: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.emeraldBright,
  },
  use: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    justifyContent: "center",
  },
  bars: { flexDirection: "row", alignItems: "center", gap: 2 },
  bar: { width: 3, borderRadius: 2 },
  sample: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.field,
    backgroundColor: colors.surface3,
  },
});
