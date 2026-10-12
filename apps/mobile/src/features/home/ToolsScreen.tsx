import type { Tool } from "@clipiro/shared";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import {
  EmptyState,
  FilterPills,
  Header,
  Icon,
  IconButton,
  SkeletonCard,
  StatusBarScrim,
  TextField,
  useToast,
} from "@/components";
import { sample } from "@/lib/images";
import { useScreenPadding } from "@/navigation/insets";
import { colors, radius, statusTint, text, type } from "@/theme";
import { errorMessage } from "@mocks/core";
import { useTools } from "./queries";
import { COMING_SOON, TOOL_ICONS, TOOL_PHOTOS, costLabel, filterTools, hasScreen, openTool, type ToolFilter } from "./tools";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "image", label: "Image" },
  { value: "free", label: "Free" },
] as const;

// design/screens/BN-Tools.html — every tool, from Home's "All →".
export function ToolsScreen() {
  const pad = useScreenPadding();
  const toast = useToast();
  const tools = useTools();
  const [filter, setFilter] = useState<ToolFilter>("all");
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  const open = (t: Tool) => openTool(t.id) || toast(COMING_SOON, "info");
  const list = tools.data ? filterTools(tools.data, filter, query) : [];
  const recommended = tools.data?.filter((t) => t.recommended) ?? [];
  const browsing = filter === "all" && !query.trim();

  const closeSearch = () => {
    setSearching(false);
    setQuery("");
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, pad]} keyboardShouldPersistTaps="handled">
        <Header
          title="Tools"
          subtitle="Everything to create, convert and clip"
          onBack={() => (router.canGoBack() ? router.back() : router.replace("/home"))}
          actions={
            <IconButton
              icon={searching ? "close" : "search"}
              accessibilityLabel={searching ? "Close search" : "Search tools"}
              onPress={searching ? closeSearch : () => setSearching(true)}
            />
          }
        />
        {searching ? (
          <TextField
            label="Search tools"
            hideLabel
            leadingIcon="search"
            value={query}
            onChangeText={setQuery}
            placeholder="Search tools"
            autoFocus
            returnKeyType="search"
            autoCorrect={false}
          />
        ) : null}

        {tools.isPending ? (
          <ToolsSkeleton />
        ) : tools.isError ? (
          <EmptyState tone="error" title="Couldn’t load tools" body={errorMessage(tools.error)} action={{ label: "Try again", onPress: () => tools.refetch() }} />
        ) : (
          <>
            {browsing && recommended.length ? (
              <View style={{ gap: 10 }}>
                <Text style={text.label} accessibilityRole="header">
                  Recommended for you
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} style={styles.bleed}>
                  {recommended.map((t) => (
                    <RecommendedCard key={t.id} tool={t} onPress={() => open(t)} />
                  ))}
                </ScrollView>
              </View>
            ) : null}
            <FilterPills options={FILTERS} value={filter} onChange={setFilter} accessibilityLabel="Filter tools" />
            {list.length ? (
              <Grid tools={list} onOpen={open} />
            ) : tools.data.length === 0 ? (
              <EmptyState icon="sparkle" title="No tools yet" body="Tools will show up here." />
            ) : (
              <EmptyState
                icon="search"
                title={query.trim() ? `No tools match “${query.trim()}”` : "Nothing in this filter"}
                body="Try another word or filter."
                action={{
                  label: "Show all tools",
                  onPress: () => {
                    setFilter("all");
                    closeSearch();
                  },
                }}
              />
            )}
          </>
        )}
      </ScrollView>
      <StatusBarScrim />
    </View>
  );
}

function RecommendedCard({ tool, onPress }: { tool: Tool; onPress: () => void }) {
  const photo = TOOL_PHOTOS[tool.id];
  const cost = costLabel(tool.cost);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${tool.name}. ${tool.description}. ${cost}`}
      style={({ pressed }) => [styles.rec, pressed && { opacity: 0.85 }]}
    >
      {photo ? <Image source={sample(photo)} style={[StyleSheet.absoluteFill, { opacity: 0.5 }]} contentFit="cover" /> : null}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={`rec-${tool.id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.2" stopColor={colors.bg} stopOpacity={0.1} />
            <Stop offset="1" stopColor={colors.bg} stopOpacity={0.92} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#rec-${tool.id})`} />
      </Svg>
      <View style={styles.recTop}>
        <Icon name={TOOL_ICONS[tool.id] ?? "sparkle"} size={22} color={colors.emeraldBright} />
        <View style={styles.costPill}>
          {tool.cost.kind === "credits" ? <Icon name="bolt" size={12} color={colors.emeraldBright} strokeWidth={2} /> : null}
          <Text style={type(11, "semibold", { color: colors.emeraldBright })} numberOfLines={1}>
            {cost}
          </Text>
        </View>
      </View>
      <View style={styles.recBottom}>
        <Text style={type(16, "bold")} numberOfLines={1}>
          {tool.name}
        </Text>
        <Text style={text.caption} numberOfLines={2}>
          {tool.description}
        </Text>
      </View>
    </Pressable>
  );
}

function Grid({ tools, onOpen }: { tools: Tool[]; onOpen: (t: Tool) => void }) {
  const rows: Tool[][] = [];
  for (let i = 0; i < tools.length; i += 2) rows.push(tools.slice(i, i + 2));
  return (
    <View style={{ gap: 10 }}>
      {rows.map((row) => (
        <View key={row.map((t) => t.id).join()} style={styles.gridRow}>
          {row.map((t) => (
            <ToolCard key={t.id} tool={t} onPress={() => onOpen(t)} />
          ))}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

function ToolCard({ tool, onPress }: { tool: Tool; onPress: () => void }) {
  const cost = costLabel(tool.cost);
  const pro = tool.requiredTier === "pro";
  const soon = !hasScreen(tool.id);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[tool.name, cost, pro ? "Pro plan" : null].filter(Boolean).join(", ")}
      accessibilityHint={soon ? "Coming to the app soon" : undefined}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surface3 }]}
    >
      <View style={styles.cardTop}>
        <View style={styles.iconTile}>
          <Icon name={TOOL_ICONS[tool.id] ?? "sparkle"} size={20} color={colors.emeraldBright} />
        </View>
        {pro ? (
          <View style={styles.pro}>
            <Text style={type(11, "bold", { color: colors.warning, tracking: 0.04 })}>PRO</Text>
          </View>
        ) : null}
      </View>
      <Text style={type(14, "semibold", { lineHeight: 1.25 })}>{tool.name}</Text>
      <Text style={[type(11, "regular", { color: tool.cost.kind === "free" ? colors.emeraldBright : colors.fgMuted }), styles.pushDown]}>{cost}</Text>
    </Pressable>
  );
}

function ToolsSkeleton() {
  return (
    <View style={{ gap: 10 }} accessible accessibilityLabel="Loading tools" accessibilityRole="progressbar">
      {[0, 1, 2].map((r) => (
        <View key={r} style={styles.gridRow}>
          <View style={{ flex: 1 }}>
            <SkeletonCard lines={2} />
          </View>
          <View style={{ flex: 1 }}>
            <SkeletonCard lines={2} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 14 },
  bleed: { marginHorizontal: -16, paddingHorizontal: 16 },
  rec: {
    width: 250,
    height: 170,
    borderRadius: radius.card,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface2,
  },
  recTop: { position: "absolute", left: 14, right: 14, top: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  recBottom: { position: "absolute", left: 14, right: 14, bottom: 14, gap: 2 },
  costPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 24,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.tintBorder,
  },
  gridRow: { flexDirection: "row", gap: 10 },
  card: {
    flex: 1,
    gap: 10,
    padding: 14,
    borderRadius: radius.tile,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    minHeight: 118,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  iconTile: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.tint, alignItems: "center", justifyContent: "center" },
  pro: { minHeight: 20, paddingHorizontal: 7, borderRadius: 6, backgroundColor: statusTint(colors.warning), justifyContent: "center" },
  pushDown: { marginTop: "auto" },
});
