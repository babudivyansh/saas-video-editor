import type { HomeSummary, Tool } from "@clipiro/shared";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import {
  Avatar,
  BrandMark,
  Button,
  Card,
  EmptyState,
  Icon,
  IconButton,
  ProgressBar,
  ScoreBadge,
  ScoreRing,
  SectionHeader,
  Skeleton,
  SkeletonCard,
  StatusBarScrim,
  useToast,
} from "@/components";
import { imageSource, sample } from "@/lib/images";
import { useScreenPadding } from "@/navigation/insets";
import { colors, radius, text, type } from "@/theme";
import { errorMessage } from "@mocks/core";
import { useHomeSummary, useTools } from "./queries";
import { COMING_SOON, HOME_TOOL_IDS, TOOL_ICONS, openTool } from "./tools";

const fmt = (n: number) => n.toLocaleString("en-US");

// design/screens/BN-Home.html — the Home tab root.
export function HomeScreen() {
  const pad = useScreenPadding();
  const summary = useHomeSummary();
  const tools = useTools();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([summary.refetch(), tools.refetch()]);
    setRefreshing(false);
  };

  return (
    <View style={styles.root}>
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, pad]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.emeraldBright} colors={[colors.emeraldBright]} progressBackgroundColor={colors.surface2} />
      }
    >
      <TopBar summary={summary.data} />
      <AutoClipHero />
      {summary.isPending ? (
        <DashboardSkeleton />
      ) : summary.isError ? (
        <Card>
          <EmptyState
            tone="error"
            title="Couldn’t load your dashboard"
            body={errorMessage(summary.error)}
            action={{ label: "Try again", onPress: () => summary.refetch() }}
          />
        </Card>
      ) : (
        <Dashboard s={summary.data} />
      )}
      <ToolsCard tools={tools.data} loading={tools.isPending} failed={tools.isError} onRetry={() => tools.refetch()} />
      {summary.data ? <EarnCredits percent={summary.data.referralPercent} /> : null}
    </ScrollView>
      <StatusBarScrim />
    </View>
  );
}

function TopBar({ summary }: { summary?: HomeSummary }) {
  const unread = summary?.unreadNotifications ?? 0;
  return (
    <View style={styles.topBar}>
      <BrandMark />
      <View style={styles.topActions}>
        <Pressable
          onPress={() => router.push("/assistant")}
          accessibilityRole="button"
          accessibilityLabel="Ask Clipiro AI"
          style={({ pressed }) => [styles.askAi, pressed && { opacity: 0.8 }]}
        >
          <Icon name="sparkle" size={16} color={colors.emeraldBright} strokeWidth={2} />
          <Text style={type(13, "semibold")} numberOfLines={1}>
            Ask AI
          </Text>
        </Pressable>
        <View>
          <IconButton
            icon="bell"
            accessibilityLabel={unread ? `Notifications, ${unread} unread` : "Notifications"}
            onPress={() => router.push("/you/notifications")}
          />
          {unread ? <View style={[styles.dot, { pointerEvents: "none" }]} /> : null}
        </View>
        <Pressable onPress={() => router.navigate("/you")} accessibilityRole="button" accessibilityLabel="Your profile">
          {summary ? (
            <Avatar name={summary.user.name} source={summary.user.avatarUrl ? imageSource(summary.user.avatarUrl) : null} size={44} decorative />
          ) : (
            <Skeleton width={44} height={44} rounded={22} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

function AutoClipHero() {
  return (
    <View style={styles.hero}>
      <View style={[styles.heroPhotos, { pointerEvents: "none" }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {(["creator-smile", "creator-violet", "gym-lift"] as const).map((p) => (
          <Image key={p} source={sample(p)} style={styles.heroPhoto} contentFit="cover" />
        ))}
      </View>
      <Svg style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          {/* Design: linear-gradient(to top, surface1 35%, surface1 @ 20%) */}
          <LinearGradient id="hero" x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0.35" stopColor={colors.surface1} stopOpacity={1} />
            <Stop offset="1" stopColor={colors.surface1} stopOpacity={0.2} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#hero)" />
      </Svg>
      <View style={styles.heroBody}>
        <Text style={type(12, "semibold", { color: colors.emeraldBright, tracking: 0.1 })}>AUTOCLIP</Text>
        <Text style={type(24, "bold", { tracking: -0.03, lineHeight: 1.1 })} accessibilityRole="header">
          Long video in. Clips out.
        </Text>
        <View style={styles.heroActions}>
          <Button label="Start AutoClipping" icon="arrowRight" onPress={() => router.push("/create/autoclip")} style={{ flex: 1 }} />
          <IconButton icon="magic" accessibilityLabel="Open the editor" size={54} onPress={() => router.push("/editor")} />
        </View>
      </View>
    </View>
  );
}

function Dashboard({ s }: { s: HomeSummary }) {
  const { clipMinutes, aiCredits, clips, projects, creator } = s;
  return (
    <>
      <View style={styles.row}>
        <Card style={styles.half}>
          <Text style={text.label}>Clip minutes</Text>
          <ScoreRing value={clipMinutes.remaining} max={Math.max(clipMinutes.total, 1)} size={54} icon="clock" label={`${fmt(clipMinutes.remaining)} of ${fmt(clipMinutes.total)} clip minutes left`} />
          <Text style={type(22, "bold", { color: colors.emeraldBright })}>
            {fmt(clipMinutes.remaining)}
            <Text style={type(12, "medium", { color: colors.fgMuted })}> min left</Text>
          </Text>
        </Card>
        <Card style={styles.half}>
          <Text style={text.label}>AI credits</Text>
          <Text style={text.display} numberOfLines={1} adjustsFontSizeToFit>
            {fmt(aiCredits.remaining)}
          </Text>
          <Text style={text.caption}>remaining</Text>
          <Button label="Top up" variant="secondary" size="sm" fullWidth onPress={() => router.push("/you/credits")} style={styles.pushDown} />
        </Card>
      </View>

      <Card>
        <SectionHeader
          title="Total clips"
          action={{ label: "My clips →", accessibilityLabel: "My clips", onPress: () => router.push("/projects/videos-reels-shorts") }}
        />
        {clips.total === 0 ? (
          <View style={styles.clipsRow}>
            <Text style={text.display}>0</Text>
            <Text style={[text.caption, { flex: 1, lineHeight: 18 }]}>No clips yet. Run AutoClip on a long video and your best moments land here.</Text>
          </View>
        ) : (
          <View style={styles.clipsRow}>
            <Text style={text.display}>{fmt(clips.total)}</Text>
            <View style={styles.thumbs}>
              {clips.top.map((c) => (
                <View key={c.id} style={styles.thumb} accessible accessibilityLabel={`Clip, virality score ${c.score}`}>
                  <Image source={imageSource(c.thumbnailUrl)} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={{ top: "30%", left: "50%" }} />
                  <View style={styles.thumbBadge}>
                    <ScoreBadge score={c.score} compact />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </Card>

      <View style={styles.row}>
        <Card style={styles.half}>
          <Text style={text.label}>Active projects</Text>
          <Text style={text.display}>{fmt(projects.active)}</Text>
          <Text style={text.caption}>{projects.rendering ? `${projects.rendering} rendering` : "Nothing rendering"}</Text>
          {projects.renderProgress != null ? (
            <ProgressBar value={projects.renderProgress} height={5} color={colors.info} label={`Rendering, ${Math.round(projects.renderProgress)}%`} />
          ) : null}
        </Card>
        <Card style={styles.half} tone="accent">
          <Text style={text.label}>Creator level</Text>
          <Text style={type(16, "bold")}>{creator.level}</Text>
          <ProgressBar value={creator.xp} max={creator.nextLevelXp} label={`${fmt(creator.xp)} of ${fmt(creator.nextLevelXp)} XP`} />
          <Text style={text.caption}>
            {fmt(creator.xp)} / {fmt(creator.nextLevelXp)} XP
          </Text>
        </Card>
      </View>
    </>
  );
}

function ToolsCard({ tools, loading, failed, onRetry }: { tools?: Tool[]; loading: boolean; failed: boolean; onRetry: () => void }) {
  const toast = useToast();
  const picks = HOME_TOOL_IDS.map((id) => tools?.find((t) => t.id === id)).filter((t): t is Tool => !!t);
  // 4-up at normal text sizes (the design); with enlarged system text the
  // labels can't fit 4 across without splitting words, so go 2-up, icon beside label.
  const wide = useWindowDimensions().fontScale > 1.15;
  const cols = wide ? 2 : 4;
  const rows: Tool[][] = [];
  for (let i = 0; i < picks.length; i += cols) rows.push(picks.slice(i, i + cols));
  return (
    <Card>
      <SectionHeader title="Tools" action={{ label: "All →", accessibilityLabel: "All tools", onPress: () => router.push("/home/recommended-tools") }} />
      {loading ? (
        [0, 1].map((r) => (
          <View key={r} style={styles.toolRow}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ flex: 1 }}>
                <Skeleton height={64} rounded={14} />
              </View>
            ))}
          </View>
        ))
      ) : failed ? (
        <View style={styles.inlineError}>
          <Text style={[text.caption, { flex: 1 }]}>Couldn’t load tools.</Text>
          <Button label="Try again" variant="ghost" size="md" icon="refresh" iconPosition="start" onPress={onRetry} />
        </View>
      ) : (
        rows.map((row, r) => (
          <View key={r} style={styles.toolRow}>
            {row.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => openTool(t.id) || toast(COMING_SOON, "info")}
                accessibilityRole="button"
                accessibilityLabel={t.name}
                style={({ pressed }) => [styles.toolTile, wide && styles.toolTileWide, pressed && { backgroundColor: colors.surface3 }]}
              >
                <Icon name={TOOL_ICONS[t.id] ?? "sparkle"} size={20} color={colors.emeraldBright} />
                <Text style={[type(11, "regular", { color: colors.fgMuted, lineHeight: 1.2 }), wide ? { flex: 1 } : styles.center]} numberOfLines={2}>
                  {t.shortName}
                </Text>
              </Pressable>
            ))}
          </View>
        ))
      )}
    </Card>
  );
}

function EarnCredits({ percent }: { percent: number }) {
  const toast = useToast();
  return (
    <Pressable
      onPress={() => toast(COMING_SOON, "info")}
      accessibilityRole="button"
      accessibilityLabel={`Earn credits. ${percent}% recurring on every paid referral`}
      style={({ pressed }) => [styles.earn, pressed && { backgroundColor: colors.surface3 }]}
    >
      <Icon name="gift" size={22} color={colors.emeraldBright} />
      <View style={{ flex: 1 }}>
        <Text style={type(14, "semibold")}>Earn credits</Text>
        <Text style={text.caption}>{percent}% recurring on every paid referral</Text>
      </View>
      <Icon name="chevronRight" size={18} color={colors.fgMuted} />
    </Pressable>
  );
}

function DashboardSkeleton() {
  return (
    <View style={{ gap: 12 }} accessible accessibilityLabel="Loading your dashboard" accessibilityRole="progressbar">
      <View style={styles.row}>
        <View style={styles.half}>
          <SkeletonCard lines={3} />
        </View>
        <View style={styles.half}>
          <SkeletonCard lines={3} />
        </View>
      </View>
      <SkeletonCard lines={3} />
      <View style={styles.row}>
        <View style={styles.half}>
          <SkeletonCard lines={3} />
        </View>
        <View style={styles.half}>
          <SkeletonCard lines={3} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 12 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48, paddingHorizontal: 4, gap: 8 },
  topActions: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  askAi: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.tintBorder,
    flexShrink: 1,
  },
  dot: {
    position: "absolute",
    top: 10,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.emeraldBright,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  hero: {
    borderRadius: radius.card,
    padding: 18,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  heroPhotos: { ...StyleSheet.absoluteFill, flexDirection: "row", gap: 4, opacity: 0.45 },
  heroPhoto: { flex: 1, height: "100%" },
  heroBody: { marginTop: 120, gap: 8 },
  heroActions: { flexDirection: "row", gap: 8, marginTop: 6, alignItems: "center" },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  pushDown: { marginTop: "auto" },
  clipsRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  thumbs: { flexDirection: "row", gap: 6, flex: 1 },
  thumb: { width: 52, height: 84, borderRadius: 10, overflow: "hidden", backgroundColor: colors.surface3 },
  thumbBadge: { position: "absolute", left: 4, top: 4 },
  toolRow: { flexDirection: "row", gap: 8 },
  toolTile: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRadius: 14,
    backgroundColor: colors.surface1,
    minHeight: 64,
  },
  toolTileWide: { flexDirection: "row", gap: 10, paddingHorizontal: 12, paddingVertical: 12 },
  center: { textAlign: "center" },
  inlineError: { flexDirection: "row", alignItems: "center", gap: 8 },
  earn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    minHeight: 44,
    borderRadius: radius.card,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
});

