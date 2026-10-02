import type { Asset } from "@clipiro/shared";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { EmptyState, Header, IconButton, SectionHeader, SkeletonCard, StatusBarScrim } from "@/components";
import { imageSource } from "@/lib/images";
import { useScreenPadding } from "@/navigation/insets";
import { colors, derived, radius, text, type } from "@/theme";
import { errorMessage } from "@mocks/core";
import { AssetChips } from "./AssetChips";
import { AssetSheet } from "./AssetSheet";
import { AudioRow } from "./AudioRow";
import { useAssets } from "./queries";

// design/screens/BN-AssetsAI.html — everything the AI tools made. The web
// doesn't save these as Assets yet; Phase 5's API does (decision 2026-10-02).
export function AiAssetsScreen() {
  const pad = useScreenPadding();
  const { width } = useWindowDimensions();
  const assets = useAssets();
  const [openId, setOpenId] = useState<string | null>(null);

  const live = (assets.data ?? []).filter((x) => !x.archivedAt);
  const images = live.filter((x) => x.source === "image-generator");
  const voiceovers = live.filter((x) => x.source === "voiceover");
  const cleanup = live.filter((x) => x.source === "enhance-speech" || x.source === "vocal-remover");
  const tile = Math.floor((width - 32 - 16) / 3);
  const all: Asset[] = [...images, ...voiceovers, ...cleanup];
  const counts: [string, number][] = [
    ["Images", images.length],
    ["Voiceovers", voiceovers.length],
    ["Cleanup", cleanup.length],
  ];

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, pad]}>
        <Header title="Assets" large actions={<IconButton icon="upload" accessibilityLabel="Upload" onPress={() => router.dismissTo("/projects/assets")} />} />
        <AssetChips value="ai" />
        {assets.isPending ? (
          <SkeletonCard lines={3} />
        ) : assets.isError ? (
          <EmptyState tone="error" title="Couldn’t load AI assets" body={errorMessage(assets.error)} action={{ label: "Try again", onPress: () => assets.refetch() }} />
        ) : all.length === 0 ? (
          <EmptyState icon="sparkle" title="Nothing generated yet" body="Images, voiceovers and cleaned-up audio from AI Media land here." action={{ label: "Open AI Media", onPress: () => router.push("/create/ai-media") }} />
        ) : (
          <>
            <View style={styles.row}>
              {counts.map(([label, n]) => (
                <View key={label} style={styles.count} accessible accessibilityLabel={`${n} ${label}`}>
                  <Text style={text.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                    {label}
                  </Text>
                  <Text style={type(26, "bold")}>{n}</Text>
                </View>
              ))}
            </View>

            <SectionHeader title="AI images" action={{ label: "Generate", onPress: () => router.push({ pathname: "/create/ai-media", params: { tab: "image" } }) }} />
            {images.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {images.map((x) => (
                  <Pressable
                    key={x.id}
                    onPress={() => setOpenId(x.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${x.name}, made with ${x.madeWith}`}
                    style={[styles.image, { width: tile, height: Math.round(tile * 1.22) }]}
                  >
                    <Image source={imageSource(x.thumbnailUrl ?? "")} style={StyleSheet.absoluteFill} contentFit="cover" />
                    <Text style={styles.model} numberOfLines={1}>
                      {x.madeWith}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Text style={text.caption}>No images yet.</Text>
            )}

            <SectionHeader title="Voiceovers" action={{ label: "My voices", onPress: () => router.push("/you/my-voices") }} />
            <List items={voiceovers} empty="No voiceovers yet." />

            <SectionHeader title="Audio cleanup" action={{ label: "Clean audio", onPress: () => router.push({ pathname: "/create/ai-media", params: { tab: "enhance" } }) }} />
            <List items={cleanup} empty="No cleaned-up audio yet." />
          </>
        )}
      </ScrollView>
      <StatusBarScrim />
      <AssetSheet asset={all.find((x) => x.id === openId) ?? null} onClose={() => setOpenId(null)} />
    </View>
  );
}

function List({ items, empty }: { items: Asset[]; empty: string }) {
  if (!items.length) return <Text style={text.caption}>{empty}</Text>;
  return (
    <View style={styles.list}>
      {items.map((x, i) => (
        <Row key={x.id} first={i === 0}>
          <AudioRow asset={x} variant="compact" />
        </Row>
      ))}
    </View>
  );
}

function Row({ first, children }: { first: boolean; children: ReactNode }) {
  return <View style={first ? null : styles.divider}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 12 },
  row: { flexDirection: "row", gap: 10 },
  count: { flex: 1, gap: 6, padding: 14, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  image: { borderRadius: radius.tile, overflow: "hidden", backgroundColor: colors.surface3 },
  model: { position: "absolute", left: 6, bottom: 6, maxWidth: "90%", ...type(11, "medium"), backgroundColor: derived.overlay, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: "hidden" },
  list: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
});
