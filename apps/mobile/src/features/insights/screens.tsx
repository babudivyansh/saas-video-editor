import {
  PROVIDER_LABEL,
  PROVIDERS,
  compact,
  sortContent,
  unavailableReason,
  type ContentSort,
  type InsightsOverview,
  type Provider,
} from "@clipiro/shared";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar, BottomSheet, EmptyState, FilterPills, Icon, OptionList, SectionHeader, SkeletonCard, useToast } from "@/components";
import { apiErrorMessage } from "@/lib/errors";
import { imageSource } from "@/lib/images";
import { colors, radius, type } from "@/theme";
import { shareAccountCsv } from "./files";
import { AreaChart, describeTrend, PercentBars, PROVIDER_COLOR, ShareBar } from "./charts";
import { InsightsShell, KpiTile, Panel, insightStyles as s } from "./InsightsShell";
import { useContent, useOverview, usePlatform, useRange, useSocialAccounts } from "./queries";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const axis = (series: InsightsOverview["series"]) => {
  const pick = [series[0], series[Math.floor(series.length / 2)], series[series.length - 1]].filter(Boolean) as InsightsOverview["series"];
  return [...new Set(pick.map((p) => day(p.date)))];
};

function Loading() {
  return (
    <>
      <View style={s.grid}>
        <View style={{ flex: 1 }}>
          <SkeletonCard lines={2} />
        </View>
        <View style={{ flex: 1 }}>
          <SkeletonCard lines={2} />
        </View>
      </View>
      <SkeletonCard lines={4} />
    </>
  );
}

function Failed({ error, retry }: { error: unknown; retry: () => void }) {
  return <EmptyState tone="error" title="Couldn’t load insights" body={apiErrorMessage(error)} action={{ label: "Try again", onPress: retry }} />;
}

// ── Overview (design/screens/BN-InsOverview.html) ─────────────────────────

export function InsightsOverviewScreen() {
  const range = useRange((r) => r.range);
  const hasAccounts = (useSocialAccounts().data?.length ?? 0) > 0;
  const q = useOverview(range, hasAccounts);
  return (
    <InsightsShell tab="overview" onRefresh={() => q.refetch()}>
      {() =>
        q.isPending ? (
          <Loading />
        ) : q.isError ? (
          <Failed error={q.error} retry={() => q.refetch()} />
        ) : (
          <>
            <View style={s.grid}>
              <KpiTile label="Total views" value={compact(q.data.totals.views.value ?? 0)} kpi={q.data.totals.views} />
              <KpiTile label="Followers" value={compact(q.data.totals.followers.value ?? 0)} kpi={q.data.totals.followers} />
            </View>
            <View style={s.grid}>
              <KpiTile label="Engagement" value={`${q.data.totals.engagementRate.value}%`} hint="typical 4–6%" />
              <KpiTile label="Clips posted" value={String(q.data.totals.clipsPosted.value ?? 0)} hint="this period" />
            </View>
            <Panel title="Views over time" note={q.data.sample ? "Sample data" : `Last ${range} days`}>
              <AreaChart values={q.data.series.map((p) => p.value)} labels={axis(q.data.series)} label={`Views a day over the last ${range} days, ${describeTrend(q.data.series.map((p) => p.value), compact)}`} />
            </Panel>
            <Panel title="Views by platform">
              <ShareBar parts={q.data.byPlatform.map((p) => ({ label: PROVIDER_LABEL[p.provider], percent: p.share, color: PROVIDER_COLOR[p.provider] }))} />
            </Panel>
            {q.data.topClip ? (
              <Pressable
                onPress={() => router.push("/social/insights/content-performance")}
                accessibilityRole="button"
                accessibilityLabel={`Top clip this period: ${q.data.topClip.title}, ${compact(q.data.topClip.views)} views on ${PROVIDER_LABEL[q.data.topClip.provider]}`}
                style={({ pressed }) => [styles.topClip, pressed && { backgroundColor: colors.surface3 }]}
              >
                <Image source={imageSource(q.data.topClip.thumbnailUrl)} style={styles.topThumb} contentFit="cover" />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={type(12, "semibold", { color: colors.emeraldBright })}>Top clip {range <= 31 ? "this month" : "this period"}</Text>
                  <Text style={type(16, "bold")} numberOfLines={2}>
                    {q.data.topClip.title}
                  </Text>
                  <Text style={type(12, "regular", { color: colors.fgMuted })}>
                    {compact(q.data.topClip.views)} views · {PROVIDER_LABEL[q.data.topClip.provider]}
                    {q.data.topClip.provider === "youtube" ? " Shorts" : ""}
                  </Text>
                </View>
                <Icon name="chevronRight" size={18} color={colors.fgMuted} />
              </Pressable>
            ) : null}
            <Pressable onPress={() => router.push("/social/insights/account-analytics")} accessibilityRole="link" style={styles.crossLink}>
              <Text style={type(13, "medium", { color: colors.emeraldBright })}>Account analytics: audience, competitors, reports →</Text>
            </Pressable>
          </>
        )
      }
    </InsightsShell>
  );
}

// ── Content (design/screens/BN-InsContent.html) ───────────────────────────

const SORTS = [
  { value: "views", label: "Views" },
  { value: "likes", label: "Likes" },
  { value: "comments", label: "Comments" },
  { value: "shares", label: "Shares" },
] as const;

export function ContentScreen() {
  const toast = useToast();
  const range = useRange((r) => r.range);
  const accounts = useSocialAccounts();
  const hasAccounts = (accounts.data?.length ?? 0) > 0;
  const q = useContent(range, hasAccounts);
  const [sort, setSort] = useState<ContentSort>("views");
  const [exporting, setExporting] = useState(false);
  const [picking, setPicking] = useState(false);

  // The web's export is per account: with more than one, ask which.
  const exportAccount = async (id: string) => {
    setPicking(false);
    setExporting(true);
    try {
      const r = await shareAccountCsv({ id });
      toast(`${r.filename}: ${r.rows} post${r.rows === 1 ? "" : "s"}.`, "success");
    } catch (e) {
      toast(apiErrorMessage(e), "error");
    } finally {
      setExporting(false);
    }
  };
  const exportCsv = () => {
    const list = accounts.data ?? [];
    if (list.length === 1) void exportAccount(list[0]!.id);
    else setPicking(true);
  };

  return (
    <InsightsShell tab="content" onRefresh={() => q.refetch()}>
      {() => (
        <>
          <FilterPills accessibilityLabel="Rank by" options={SORTS} value={sort} onChange={setSort} />
          {q.isPending ? (
            <Loading />
          ) : q.isError ? (
            <Failed error={q.error} retry={() => q.refetch()} />
          ) : q.data.posts.length === 0 ? (
            <EmptyState icon="projects" title="No posts in this period" body="Post clips to a connected account and they'll be ranked here." />
          ) : (
            <>
              <View style={s.grid}>
                <KpiTile label="Avg views" value={q.data.avgViews != null ? compact(q.data.avgViews) : "—"} />
                <KpiTile label="Avg watch" value={q.data.avgWatchPercent != null ? `${q.data.avgWatchPercent}%` : "—"} />
                <KpiTile label="Best time" value={q.data.bestTime ?? "—"} />
              </View>
              <SectionHeader title={`Top content · ${sortLabel(sort)}`} action={{ label: exporting ? "Exporting…" : "Export CSV", onPress: exportCsv }} />
              {sortContent(q.data.posts, sort).map((p, i) => (
                <View key={p.id} style={styles.post} accessible accessibilityLabel={`${i + 1}. ${p.title}, ${PROVIDER_LABEL[p.provider]} ${p.format}. ${compact(p.views)} views, ${compact(p.likes)} likes, ${p.comments} comments, ${p.shares} shares`}>
                  <Text style={[type(14, "semibold", { color: colors.emeraldBright }), { width: 14 }]}>{i + 1}</Text>
                  <Image source={imageSource(p.thumbnailUrl)} style={styles.postThumb} contentFit="cover" />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={type(14, "semibold")} numberOfLines={2}>
                      {p.title}
                    </Text>
                    <View style={styles.stats}>
                      <Stat icon="eye" n={p.views} />
                      <Stat icon="star" n={p.likes} />
                      <Stat icon="captions" n={p.comments} />
                      <Stat icon="social" n={p.shares} />
                    </View>
                    <Text style={type(11, "regular", { color: colors.fgSubtle })}>
                      {PROVIDER_LABEL[p.provider]} · {p.format}
                    </Text>
                  </View>
                  <Text style={type(16, "bold")}>{compact(p[sort])}</Text>
                </View>
              ))}
            </>
          )}
          <BottomSheet visible={picking} onClose={() => setPicking(false)} title="Export which account?">
            <OptionList
              accessibilityLabel="Account to export"
              value={null}
              options={(accounts.data ?? []).map((a) => ({ value: a.id, label: PROVIDER_LABEL[a.provider], detail: a.handle }))}
              onChange={(id) => void exportAccount(id)}
            />
          </BottomSheet>
        </>
      )}
    </InsightsShell>
  );
}

const sortLabel = (s: ContentSort) => SORTS.find((x) => x.value === s)?.label ?? "";

function Stat({ icon, n }: { icon: "eye" | "star" | "captions" | "social"; n: number }) {
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={12} color={colors.fgMuted} />
      <Text style={type(11, "regular", { color: colors.fgMuted })}>{compact(n)}</Text>
    </View>
  );
}

// ── Platforms (design/screens/BN-InsPlatform.html) ────────────────────────

export function PlatformsScreen() {
  const range = useRange((r) => r.range);
  const accounts = useSocialAccounts();
  const connected = PROVIDERS.filter((p) => accounts.data?.some((a) => a.provider === p));
  const [provider, setProvider] = useState<Provider>("youtube");
  const current = connected.includes(provider) ? provider : (connected[0] ?? "youtube");
  const account = accounts.data?.find((a) => a.provider === current);
  const q = usePlatform(account?.id ?? null, range);
  const watch = unavailableReason(current, "watchTimeSec");

  return (
    <InsightsShell tab="platforms" onRefresh={() => q.refetch()}>
      {() => (
        <>
          <View style={styles.providers} accessibilityRole="radiogroup" accessibilityLabel="Platform">
            {connected.map((p) => {
              const a = accounts.data?.find((x) => x.provider === p);
              const on = p === current;
              return (
                <Pressable key={p} onPress={() => setProvider(p)} accessibilityRole="radio" aria-checked={on} accessibilityLabel={PROVIDER_LABEL[p]} style={[styles.provider, on && styles.providerOn]}>
                  <Avatar name={a?.name ?? p} source={a?.avatarUrl ? imageSource(a.avatarUrl) : null} size={28} decorative />
                  <Text style={type(13, on ? "semibold" : "medium")}>{PROVIDER_LABEL[p]}</Text>
                </Pressable>
              );
            })}
          </View>
          {account?.health === "reconnect" ? (
            <Pressable onPress={() => router.navigate("/social")} accessibilityRole="button" style={styles.warn}>
              <Icon name="alert" size={16} color={colors.warning} />
              <Text style={[type(13, "regular"), { flex: 1 }]}>{PROVIDER_LABEL[current]} needs reconnecting. Numbers stop updating until you do.</Text>
              <Text style={type(13, "semibold", { color: colors.warning })}>Fix</Text>
            </Pressable>
          ) : null}
          {q.isPending ? (
            <Loading />
          ) : q.isError ? (
            <Failed error={q.error} retry={() => q.refetch()} />
          ) : (
            <>
              <View style={s.grid}>
                <KpiTile label="Followers" value={compact(q.data.followers.value ?? 0)} kpi={q.data.followers} />
                <KpiTile label="Views" value={compact(q.data.views.value ?? 0)} kpi={q.data.views} />
              </View>
              <View style={s.grid}>
                <KpiTile label="Engagement" value={`${q.data.engagementRate.value}%`} />
                <KpiTile label="Watch time" value={`${compact(q.data.watchTimeHours.value ?? 0)} h`} unavailable={watch} />
              </View>
              <Panel title="Follower growth" note={`Last ${range} days`}>
                <AreaChart values={q.data.growth.map((g) => g.value)} height={100} label={`${PROVIDER_LABEL[current]} followers over the last ${range} days, ${describeTrend(q.data.growth.map((g) => g.value), compact)}`} />
              </Panel>
              <Panel title="Audience age">
                <PercentBars rows={q.data.age} />
              </Panel>
              <Panel title="Top countries">
                <PercentBars rows={q.data.countries} bars={false} />
              </Panel>
            </>
          )}
        </>
      )}
    </InsightsShell>
  );
}

const styles = StyleSheet.create({
  topClip: { flexDirection: "row", alignItems: "center", gap: 14, padding: 12, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  topThumb: { width: 64, height: 88, borderRadius: 12 },
  crossLink: { minHeight: 44, justifyContent: "center", alignItems: "center" },
  post: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  postThumb: { width: 44, height: 62, borderRadius: 8 },
  stats: { flexDirection: "row", flexWrap: "wrap", columnGap: 10, rowGap: 2 },
  stat: { flexDirection: "row", alignItems: "center", gap: 3 },
  providers: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  provider: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingLeft: 6, paddingRight: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong },
  providerOn: { backgroundColor: colors.tint, borderColor: colors.emeraldBright },
  warn: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radius.tile, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.warning, minHeight: 44 },
});

