import { ASSET_SORTS, formatBytes, sortAssets, type AssetSort } from "@clipiro/shared";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BottomSheet, EmptyState, Header, IconButton, OptionList, SkeletonCard, StatusBarScrim, TextField } from "@/components";
import { useScreenPadding } from "@/navigation/insets";
import { colors, text, type } from "@/theme";
import { errorMessage } from "@mocks/core";
import { AssetChips } from "./AssetChips";
import { AssetSheet } from "./AssetSheet";
import { AudioRow } from "./AudioRow";
import { useAssets } from "./queries";

// design/screens/BN-AssetsAudio.html — every audio file, playable in the list.
export function AudioScreen() {
  const pad = useScreenPadding();
  const assets = useAssets();
  const [sort, setSort] = useState<AssetSort>("date");
  const [sorting, setSorting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const audio = sortAssets((assets.data ?? []).filter((x) => x.kind === "audio" && !x.archivedAt && (!q || x.name.toLowerCase().includes(q))), sort);
  const total = audio.reduce((t, x) => t + x.sizeBytes, 0);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, pad]} keyboardShouldPersistTaps="handled">
        <Header
          title="Assets"
          large
          actions={
            <>
              <IconButton
                icon={searching ? "close" : "search"}
                accessibilityLabel={searching ? "Close search" : "Search"}
                onPress={() => {
                  setSearching((s) => !s);
                  setQuery("");
                }}
              />
              <IconButton icon="upload" accessibilityLabel="Upload" onPress={() => router.dismissTo("/projects/assets")} />
            </>
          }
        />
        {searching ? <TextField label="Search audio" hideLabel leadingIcon="search" value={query} onChangeText={setQuery} placeholder="Search audio" autoFocus /> : null}
        <AssetChips value="audio" />
        {assets.isPending ? (
          <SkeletonCard lines={3} />
        ) : assets.isError ? (
          <EmptyState tone="error" title="Couldn’t load your audio" body={errorMessage(assets.error)} action={{ label: "Try again", onPress: () => assets.refetch() }} />
        ) : audio.length === 0 ? (
          <EmptyState
            icon="music"
            title={q ? `No audio matches “${query.trim()}”` : "No audio yet"}
            body="Upload music or voice tracks, or make a voiceover in AI Media."
            action={q ? undefined : { label: "Make a voiceover", onPress: () => router.push({ pathname: "/create/ai-media", params: { tab: "voiceover" } }) }}
          />
        ) : (
          <>
            <View style={styles.head}>
              <Text style={text.label} accessibilityRole="header">
                {audio.length} audio files · {formatBytes(total)}
              </Text>
              <Pressable onPress={() => setSorting(true)} accessibilityRole="button" accessibilityLabel={`Sort: ${ASSET_SORTS.find((s) => s.id === sort)?.label}`} style={styles.link}>
                <Text style={type(12, "regular", { color: colors.fgMuted })}>{ASSET_SORTS.find((s) => s.id === sort)?.label}</Text>
              </Pressable>
            </View>
            {audio.map((x) => (
              <AudioRow key={x.id} asset={x} onMore={() => setOpenId(x.id)} />
            ))}
          </>
        )}
      </ScrollView>
      <StatusBarScrim />
      <AssetSheet asset={audio.find((x) => x.id === openId) ?? null} onClose={() => setOpenId(null)} />
      <BottomSheet visible={sorting} onClose={() => setSorting(false)} title="Sort by">
        <OptionList
          accessibilityLabel="Sort by"
          value={sort}
          options={ASSET_SORTS.map((s) => ({ value: s.id, label: s.label }))}
          onChange={(v) => {
            setSort(v);
            setSorting(false);
          }}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 12 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  link: { minHeight: 44, justifyContent: "center", paddingLeft: 12 },
});
