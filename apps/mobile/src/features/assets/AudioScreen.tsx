import { ASSET_SORTS, type AssetSort } from "@clipiro/shared";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { BottomSheet, EmptyState, Header, IconButton, OptionList, SkeletonCard, StatusBarScrim, TextField } from "@/components";
import { apiErrorMessage } from "@/lib/errors";
import { useDebounced } from "@/lib/useDebounced";
import { useScreenPadding } from "@/navigation/insets";
import { colors, text, type } from "@/theme";
import { AssetChips } from "./AssetChips";
import { AssetSheet } from "./AssetSheet";
import { AudioRow } from "./AudioRow";
import { useAssetList } from "./queries";

// design/screens/BN-AssetsAudio.html — every audio file, playable in the list
// (one track at a time; AudioRow). Paged, searched and sorted on the server.
export function AudioScreen() {
  const pad = useScreenPadding();
  const [sort, setSort] = useState<AssetSort>("date");
  const [sorting, setSorting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const q = useDebounced(query.trim());
  const audio = useAssetList({ kind: "audio", sort, q });
  const firstLoad = audio.isPending && !audio.data;

  const header = (
    <View style={styles.header}>
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
      {firstLoad ? (
        <SkeletonCard lines={3} />
      ) : audio.isError && !audio.data ? (
        <EmptyState tone="error" title="Couldn’t load your audio" body={apiErrorMessage(audio.error)} action={{ label: "Try again", onPress: () => audio.refetch() }} />
      ) : audio.total === 0 ? (
        <EmptyState
          icon="music"
          title={q ? `No audio matches “${q}”` : "No audio yet"}
          body="Upload music or voice tracks, or make a voiceover in AI Media."
          action={q ? undefined : { label: "Make a voiceover", onPress: () => router.push({ pathname: "/create/ai-media", params: { tab: "voiceover" } }) }}
        />
      ) : (
        <View style={styles.head}>
          <Text style={text.label} accessibilityRole="header">
            {audio.total} audio file{audio.total === 1 ? "" : "s"}
          </Text>
          <Pressable onPress={() => setSorting(true)} accessibilityRole="button" accessibilityLabel={`Sort: ${ASSET_SORTS.find((s) => s.id === sort)?.label}`} hitSlop={6} style={styles.link}>
            <Text style={type(12, "regular", { color: colors.fgMuted })}>{ASSET_SORTS.find((s) => s.id === sort)?.label}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <FlashList
        data={firstLoad || (audio.isError && !audio.data) ? [] : audio.items}
        keyExtractor={(x) => x.id}
        renderItem={({ item }) => (
          <View style={styles.cell}>
            <AudioRow asset={item} onMore={() => setOpenId(item.id)} />
          </View>
        )}
        ListHeaderComponent={header}
        ListFooterComponent={audio.isFetchingNextPage ? <ActivityIndicator color={colors.emeraldBright} style={{ marginVertical: 16 }} /> : null}
        onEndReached={() => audio.hasNextPage && !audio.isFetchingNextPage && void audio.fetchNextPage()}
        onEndReachedThreshold={0.6}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ ...pad, paddingHorizontal: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await audio.refetch();
              setRefreshing(false);
            }}
            tintColor={colors.emeraldBright}
            colors={[colors.emeraldBright]}
            progressBackgroundColor={colors.surface2}
          />
        }
      />
      <StatusBarScrim />
      <AssetSheet asset={audio.items.find((x) => x.id === openId) ?? null} onClose={() => setOpenId(null)} />
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
  header: { gap: 12, paddingBottom: 12 },
  cell: { paddingBottom: 10 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  link: { minHeight: 44, justifyContent: "center", paddingLeft: 12 },
});
