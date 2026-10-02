import { RANGE_DAYS, rangeLabel, type Kpi } from "@clipiro/shared";
import { router, type Href } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { BottomSheet, EmptyState, Header, OptionList, SegmentedControl, SkeletonCard, StatusBarScrim } from "@/components";
import { useScreenPadding } from "@/navigation/insets";
import { colors, radius, text, type } from "@/theme";
import { errorMessage } from "@mocks/core";
import { useRange, useSocialAccounts } from "./queries";

type Tab = "overview" | "content" | "platforms";
const TABS = [
  { value: "overview", label: "Overview" },
  { value: "content", label: "Content" },
  { value: "platforms", label: "Platforms" },
] as const;
const HREF: Record<Tab, Href> = {
  overview: "/social/insights",
  content: "/social/insights/content-performance",
  platforms: "/social/insights/platform-analytics",
};

// Frame shared by the three Insights tabs (design/screens/BN-Ins*.html): back,
// title, period pill, the Overview / Content / Platforms switch. Shows the
// "connect an account" state when nothing is connected yet.
export function InsightsShell({ tab, children, onRefresh }: { tab: Tab; children: (hasAccounts: boolean) => ReactNode; onRefresh: () => Promise<unknown> }) {
  const pad = useScreenPadding();
  const { range, setRange } = useRange();
  const accounts = useSocialAccounts();
  const [picking, setPicking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([accounts.refetch(), onRefresh()]);
    setRefreshing(false);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, pad]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.emeraldBright} colors={[colors.emeraldBright]} progressBackgroundColor={colors.surface2} />}
      >
        <Header
          title="Insights"
          onBack={() => (router.canGoBack() ? router.back() : router.replace("/social"))}
          actions={
            <Pressable onPress={() => setPicking(true)} accessibilityRole="button" accessibilityLabel={`Period: last ${range} days. Change`} style={styles.range}>
              <Text style={type(13, "semibold", { color: colors.bg })}>{rangeLabel(range)}</Text>
            </Pressable>
          }
        />
        <SegmentedControl accessibilityLabel="Insights" options={TABS} value={tab} onChange={(t) => t !== tab && router.replace(HREF[t])} />
        {accounts.isPending ? (
          <>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={4} />
          </>
        ) : accounts.isError ? (
          <EmptyState tone="error" title="Couldn’t load your accounts" body={errorMessage(accounts.error)} action={{ label: "Try again", onPress: () => accounts.refetch() }} />
        ) : accounts.data.length === 0 ? (
          <EmptyState
            icon="social"
            title="Connect an account to see insights"
            body="Link YouTube, Instagram or Facebook. Numbers start filling in after the first sync."
            action={{ label: "Connect an account", onPress: () => router.navigate("/social") }}
          />
        ) : (
          children(true)
        )}
      </ScrollView>
      <StatusBarScrim />
      <BottomSheet visible={picking} onClose={() => setPicking(false)} title="Period">
        <OptionList
          accessibilityLabel="Period"
          value={String(range)}
          options={RANGE_DAYS.map((d) => ({ value: String(d), label: d === 365 ? "Last year" : `Last ${d} days` }))}
          onChange={(v) => {
            setRange(Number(v) as (typeof RANGE_DAYS)[number]);
            setPicking(false);
          }}
        />
      </BottomSheet>
    </View>
  );
}

/** KPI tile: label, big number, coloured change or a hint. */
export function KpiTile({ label, value, kpi, hint, unavailable }: { label: string; value: string; kpi?: Kpi; hint?: string; unavailable?: string | null }) {
  const d = kpi?.delta;
  return (
    <View style={styles.kpi} accessible accessibilityLabel={`${label}: ${unavailable ? "not available" : value}${d != null ? `, ${d >= 0 ? "up" : "down"} ${Math.abs(d)}%` : ""}${unavailable ? `. ${unavailable}` : ""}`}>
      <Text style={text.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {label}
      </Text>
      <Text style={type(28, "heavy", { tracking: -0.02, color: unavailable ? colors.fgSubtle : colors.fg })} numberOfLines={1} adjustsFontSizeToFit>
        {unavailable ? "—" : value}
      </Text>
      {unavailable ? (
        <Text style={type(11, "regular", { color: colors.fgSubtle })} numberOfLines={2}>
          {unavailable}
        </Text>
      ) : d != null ? (
        <Text style={type(12, "medium", { color: d >= 0 ? colors.emeraldBright : colors.error })}>
          {d >= 0 ? "+" : "−"}
          {Math.abs(d)}%
        </Text>
      ) : hint ? (
        <Text style={type(12, "regular", { color: colors.fgMuted })}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Panel({ title, note, children }: { title?: string; note?: string; children: ReactNode }) {
  return (
    <View style={styles.panel}>
      {title ? (
        <View style={styles.panelHead}>
          <Text style={[type(15, "bold"), { flex: 1 }]} accessibilityRole="header">
            {title}
          </Text>
          {note ? <Text style={type(11, "regular", { color: colors.fgSubtle })}>{note}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export const insightStyles = StyleSheet.create({
  grid: { flexDirection: "row", gap: 10 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 12 },
  range: { minHeight: 44, minWidth: 56, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.fg, alignItems: "center", justifyContent: "center" },
  kpi: { flex: 1, gap: 6, padding: 14, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  panel: { gap: 14, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  panelHead: { flexDirection: "row", alignItems: "center", gap: 8 },
});
