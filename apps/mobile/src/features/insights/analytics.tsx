import {
  BLOCK_LABELS,
  COMPETITOR_PROVIDERS,
  DAYS_SHORT,
  MAX_COMPETITORS,
  PROVIDER_LABEL,
  PROVIDERS,
  WEEKLY_SUMMARY_CREDITS,
  bestOnline,
  compact,
  type Provider,
  type WeeklySummary,
} from "@clipiro/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Avatar,
  BottomSheet,
  Button,
  OptionList,
  ConfirmSheet,
  EmptyState,
  Icon,
  ScoreRing,
  SkeletonCard,
  StatusBadge,
  TextField,
  useToast,
  type IconName,
} from "@/components";
import { social } from "@/lib/api";
import { apiErrorMessage as errorMessage } from "@/lib/errors";
import { imageSource } from "@/lib/images";
import { colors, radius, statusTint, text, type } from "@/theme";
import { useCreateContext } from "../create/queries";
import { whenEdited } from "../projects/format";
import { AnalyticsShell } from "./AnalyticsShell";
import { AreaChart, describeTrend, Heatmap, PercentBars } from "./charts";
import { shareAccountCsv } from "./files";
import { KpiTile, Panel, insightStyles as s } from "./InsightsShell";
import { useSocialAccounts } from "./queries";

export const analyticsKeys = {
  overview: ["analytics", "overview"] as const,
  summary: (accountId: string) => ["analytics", "summary", accountId] as const,
  audience: (accountId: string) => ["analytics", "audience", accountId] as const,
  competitors: ["analytics", "competitors"] as const,
  reports: ["analytics", "reports"] as const,
};

function Failed({ error, retry }: { error: unknown; retry: () => void }) {
  return <EmptyState tone="error" title="Couldn’t load analytics" body={errorMessage(error)} action={{ label: "Try again", onPress: retry }} />;
}

// ── Overview (design/screens/BN-Social.html) ──────────────────────────────

export function AnalyticsOverviewScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const accounts = useSocialAccounts();
  const credits = useCreateContext().data?.aiCredits;
  const q = useQuery({ queryKey: analyticsKeys.overview, queryFn: () => social.analytics(30) });
  // The summary is per account (the web's executive summary): the healthiest first.
  const list = accounts.data ?? [];
  const [summaryFor, setSummaryFor] = useState<string | null>(null);
  const summaryAccount = list.find((a) => a.id === summaryFor) ?? list.find((a) => a.health === "healthy") ?? list[0];
  const summary = useQuery({ queryKey: analyticsKeys.summary(summaryAccount?.id ?? ""), queryFn: async () => (await social.summary(summaryAccount!.id)).summary, enabled: !!summaryAccount });
  const [generating, setGenerating] = useState(false);
  const [exportPick, setExportPick] = useState(false);

  const generate = async () => {
    if (!summaryAccount) return;
    if (credits != null && credits < WEEKLY_SUMMARY_CREDITS) return toast(`The summary costs ${WEEKLY_SUMMARY_CREDITS} AI credits; you have ${credits}.`, "info");
    setGenerating(true);
    try {
      const { summary: made } = await social.makeSummary({ accountId: summaryAccount.id, period: "weekly" });
      qc.setQueryData(analyticsKeys.summary(summaryAccount.id), made);
      void qc.invalidateQueries({ queryKey: ["account"] });
    } catch (e) {
      toast(`${errorMessage(e)} No credits were charged.`, "error");
    } finally {
      setGenerating(false);
    }
  };

  const sync = async () => {
    toast("Syncing your accounts.", "info");
    const done = await Promise.allSettled(list.map((a) => social.syncAccount(a.id)));
    const failed = done.filter((d) => d.status === "rejected").length;
    await Promise.all([q.refetch(), accounts.refetch()]);
    if (failed) toast(`${failed} account${failed === 1 ? "" : "s"} couldn’t sync. Try again later.`, "error");
  };
  const exportAccount = async (id: string) => {
    setExportPick(false);
    try {
      const r = await shareAccountCsv({ id });
      toast(`${r.filename}: ${r.rows} post${r.rows === 1 ? "" : "s"}.`, "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const ACTIONS: { icon: IconName; label: string; onPress: () => void }[] = [
    { icon: "refresh", label: "Sync now", onPress: () => void sync() },
    { icon: "file", label: "New report", onPress: () => router.replace("/social/insights/account-analytics/reports") },
    { icon: "link", label: "Share link", onPress: () => router.replace("/social/insights/account-analytics/reports") },
    { icon: "download", label: "Export CSV", onPress: () => (list.length === 1 ? void exportAccount(list[0]!.id) : setExportPick(true)) },
  ];

  return (
    <AnalyticsShell tab="overview" onRefresh={() => q.refetch()}>
      {q.isPending ? (
        <SkeletonCard lines={4} />
      ) : q.isError ? (
        <Failed error={q.error} retry={() => q.refetch()} />
      ) : (
        <>
          <Panel>
            <View style={styles.rowBetween}>
              <Text style={text.label}>Total followers</Text>
              <Text style={type(11, "regular", { color: colors.fgSubtle })}>30D</Text>
            </View>
            <Text style={type(34, "heavy", { tracking: -0.03 })}>
              {compact(q.data.totalFollowers.value ?? 0)}{" "}
              <Text style={type(13, "semibold", { color: colors.emeraldBright })}>+{compact(q.data.totalFollowers.gained)}</Text>
            </Text>
            <AreaChart values={q.data.followerSeries.map((p) => p.value)} height={90} label={`Followers over 30 days, ${describeTrend(q.data.followerSeries.map((p) => p.value), compact)}`} />
          </Panel>
          <View style={s.grid}>
            {(accounts.data ?? []).map((a) => (
              <Pressable
                key={a.id}
                onPress={() => (a.health === "reconnect" ? router.navigate("/social") : router.push("/social/insights/platform-analytics"))}
                accessibilityRole="button"
                accessibilityLabel={`${PROVIDER_LABEL[a.provider]}, ${compact(a.followers)} followers, ${a.health === "reconnect" ? "needs reconnecting" : "healthy"}`}
                style={styles.account}
              >
                <View style={styles.accountHead}>
                  <Avatar name={a.name} source={a.avatarUrl ? imageSource(a.avatarUrl) : null} size={22} decorative />
                  <Text style={type(12, "semibold")} numberOfLines={1}>
                    {PROVIDER_LABEL[a.provider]}
                  </Text>
                </View>
                <Text style={type(20, "bold")}>{compact(a.followers)}</Text>
                {a.health === "reconnect" ? <StatusBadge label="Reconnect" tone="warning" /> : <StatusBadge label="Healthy" tone="success" />}
              </Pressable>
            ))}
          </View>
          <View style={s.grid}>
            <KpiTile label="Total views" value={compact(q.data.views.value ?? 0)} kpi={q.data.views} />
            <KpiTile label="Engagement" value={`${q.data.engagementRate.value}%`} hint="typical 4–6%" />
          </View>
          <View style={s.grid}>
            <KpiTile label="Interactions" value={compact(q.data.interactions.value ?? 0)} kpi={q.data.interactions} />
            <KpiTile label="Share" value={`${q.data.topShare.percent}%`} hint={PROVIDER_LABEL[q.data.topShare.provider]} />
          </View>
          <View style={styles.summary}>
            <View style={styles.summaryHead}>
              <Icon name="sparkle" size={16} color={colors.emeraldBright} />
              <Text style={type(15, "bold")} accessibilityRole="header">
                Weekly summary
              </Text>
            </View>
            {list.length > 1 && summaryAccount ? (
              <ProviderSwitch providers={list.map((a) => a.provider)} value={summaryAccount.provider} onChange={(p) => setSummaryFor(list.find((a) => a.provider === p)?.id ?? null)} />
            ) : null}
            {summary.isPending && summaryAccount ? (
              <SkeletonCard lines={2} />
            ) : summary.data ? (
              <SummaryBody s={summary.data} />
            ) : (
              <>
                <Text style={type(13, "regular", { color: colors.fgMuted, lineHeight: 1.45 })}>What moved, what worked, what to try next — from this dashboard’s numbers only.</Text>
                <Button label={`Generate · ${WEEKLY_SUMMARY_CREDITS} cr`} onPress={generate} loading={generating} fullWidth />
              </>
            )}
          </View>
          <View style={s.grid}>
            <Panel title="Account health" style={{ flex: 1 }}>
              <View style={styles.rowStart}>
                <ScoreRing value={q.data.healthScore ?? 0} size={56} label={`Account health ${q.data.healthScore} of 100`} />
                <Text style={type(12, "regular", { color: colors.fgMuted })}>Scored nightly</Text>
              </View>
            </Panel>
            <Panel title="Actions" style={{ flex: 1 }}>
              <View style={styles.actions}>
                {ACTIONS.map((a) => (
                  <Pressable key={a.label} onPress={a.onPress} accessibilityRole="button" accessibilityLabel={a.label} style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.surface3 }]}>
                    <Icon name={a.icon} size={18} color={colors.emeraldBright} />
                  </Pressable>
                ))}
              </View>
            </Panel>
          </View>
        </>
      )}
      <BottomSheet visible={exportPick} onClose={() => setExportPick(false)} title="Export which account?">
        <OptionList accessibilityLabel="Account to export" value={null} options={list.map((a) => ({ value: a.id, label: PROVIDER_LABEL[a.provider], detail: a.handle }))} onChange={(id) => void exportAccount(id)} />
      </BottomSheet>
    </AnalyticsShell>
  );
}

/** The AI summary: what happened, then wins, concerns and what to try. */
function SummaryBody({ s }: { s: WeeklySummary }) {
  const when = new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <View style={{ gap: 10 }} accessibilityLiveRegion="polite">
      <Text style={type(14, "regular", { lineHeight: 1.5 })}>{s.summary}</Text>
      {s.wins.length ? <Bullets title="Wins" items={s.wins} /> : null}
      {s.concerns.length ? <Bullets title="Watch" items={s.concerns} /> : null}
      {s.recommendations.length ? <Bullets title="Try next" items={s.recommendations.map((r) => `${r.title}: ${r.why}`)} /> : null}
      <Text style={type(11, "regular", { color: colors.fgSubtle })}>Made {when}</Text>
    </View>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={text.label}>{title}</Text>
      {items.map((t) => (
        <Text key={t} style={type(13, "regular", { lineHeight: 1.45 })}>
          • {t}
        </Text>
      ))}
    </View>
  );
}

// ── Audience (design/screens/BN-SocialAudience.html) ──────────────────────

export function AudienceScreen() {
  const accounts = useSocialAccounts();
  const connected = PROVIDERS.filter((p) => accounts.data?.some((a) => a.provider === p));
  const [picked, setPicked] = useState<Provider>("instagram");
  const provider = connected.includes(picked) ? picked : (connected[0] ?? "instagram");
  const accountId = accounts.data?.find((a) => a.provider === provider)?.id ?? null;
  const q = useQuery({ queryKey: analyticsKeys.audience(accountId ?? ""), queryFn: () => social.audience(accountId!), enabled: !!accountId });
  const best = q.data ? bestOnline(q.data.online) : null;
  const bestText = best ? `${DAYS_SHORT[best.day]} ${BLOCK_LABELS[best.block]}` : "";

  return (
    <AnalyticsShell tab="audience" onRefresh={() => q.refetch()}>
      <ProviderSwitch providers={connected} value={provider} onChange={setPicked} />
      {q.isPending ? (
        <SkeletonCard lines={4} />
      ) : q.isError ? (
        <Failed error={q.error} retry={() => q.refetch()} />
      ) : (
        <>
          <Panel title="Followers" note={`${PROVIDER_LABEL[provider]} · updated daily`}>
            <Text style={type(24, "heavy")}>
              {compact(q.data.followers)} <Text style={type(12, "semibold", { color: colors.emeraldBright })}>+{q.data.followersGainedThisMonth} this month</Text>
            </Text>
            <View style={styles.gender} accessible accessibilityLabel={`Women ${q.data.gender.women}%, men ${q.data.gender.men}%, other ${q.data.gender.other}%`}>
              <View style={{ flex: q.data.gender.women, backgroundColor: colors.emeraldBright }} />
              <View style={{ flex: q.data.gender.men, backgroundColor: colors.info }} />
              <View style={{ flex: Math.max(q.data.gender.other, 1), backgroundColor: colors.warning }} />
            </View>
            <View style={styles.legend}>
              <Legend color={colors.emeraldBright} label={`Women ${q.data.gender.women}%`} />
              <Legend color={colors.info} label={`Men ${q.data.gender.men}%`} />
              <Legend color={colors.warning} label={`Other ${q.data.gender.other}%`} />
            </View>
          </Panel>
          <Panel title="Age">
            <PercentBars rows={q.data.age} />
          </Panel>
          <Panel title="When they’re online">
            <View style={styles.bestPill}>
              <Text style={type(11, "semibold", { color: colors.emeraldBright })}>Best: {bestText}</Text>
            </View>
            <Heatmap grid={q.data.online} best={best!} label={`Followers are most active ${bestText}`} />
            <Text style={type(11, "regular", { color: colors.fgSubtle })}>Darker means more followers online. The composer’s “Best time” uses this.</Text>
          </Panel>
          <Panel title="Top countries">
            <PercentBars rows={q.data.countries} stacked />
          </Panel>
          <Panel title="Top cities">
            <PercentBars rows={q.data.cities} stacked />
          </Panel>
        </>
      )}
    </AnalyticsShell>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={type(11, "regular", { color: colors.fgMuted })}>{label}</Text>
    </View>
  );
}

function ProviderSwitch({ providers, value, onChange }: { providers: readonly Provider[]; value: Provider; onChange: (p: Provider) => void }) {
  const accounts = useSocialAccounts();
  return (
    <View style={styles.providers} accessibilityRole="radiogroup" accessibilityLabel="Platform">
      {providers.map((p) => {
        const a = accounts.data?.find((x) => x.provider === p);
        const on = p === value;
        return (
          <Pressable key={p} onPress={() => onChange(p)} accessibilityRole="radio" aria-checked={on} accessibilityLabel={PROVIDER_LABEL[p]} style={[styles.provider, on && styles.providerOn]}>
            <Avatar name={a?.name ?? p} source={a?.avatarUrl ? imageSource(a.avatarUrl) : null} size={28} decorative />
            <Text style={type(13, on ? "semibold" : "medium")}>{PROVIDER_LABEL[p]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Competitors (design/screens/BN-SocialCompetitors.html) ────────────────

export function CompetitorsScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const accounts = useSocialAccounts();
  const connected = COMPETITOR_PROVIDERS.filter((p) => accounts.data?.some((a) => a.provider === p));
  const [picked, setPicked] = useState<Provider>("instagram");
  const provider = connected.includes(picked) ? picked : (connected[0] ?? "instagram");
  const q = useQuery({ queryKey: analyticsKeys.competitors, queryFn: social.competitors, enabled: connected.length > 0 });
  const [adding, setAdding] = useState(false);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const me = accounts.data?.find((a) => a.provider === provider);
  const rivals = (q.data?.competitors ?? []).filter((c) => c.provider === provider);
  const total = q.data?.competitors.length ?? 0;
  const max = q.data?.max ?? MAX_COMPETITORS;
  const mineRow = q.data?.mine.find((m) => m.provider === provider);
  const mine = mineRow && mineRow.engagementRate != null ? { engagementRate: mineRow.engagementRate, postsPerWeek: mineRow.postsPerWeek ?? 0 } : undefined;

  const add = async () => {
    setBusy(true);
    try {
      qc.setQueryData(analyticsKeys.competitors, await social.addCompetitor({ provider: provider as "instagram" | "youtube", handle }));
      setAdding(false);
      setHandle("");
      setError(undefined);
      toast("Tracking started. Public stats refresh daily.", "success");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    try {
      qc.setQueryData(analyticsKeys.competitors, await social.removeCompetitor(id));
      toast("Stopped tracking.", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setRemoving(null);
    }
  };

  const best = rivals.reduce<(typeof rivals)[number] | null>((b, c) => (!b || c.engagementRate > b.engagementRate ? c : b), null);
  const note =
    rivals.length && best
      ? !mine
        ? null
        : best.engagementRate > mine.engagementRate
          ? `${best.name} leads on engagement at ${best.engagementRate}% while posting ${best.postsPerWeek} times a week. Your ${mine.engagementRate}% is ${(best.engagementRate - mine.engagementRate).toFixed(1)} points behind.`
          : `Your ${mine.engagementRate}% engagement beats every tracked account; the closest is ${best.name} at ${best.engagementRate}%.`
      : null;

  return (
    <AnalyticsShell tab="competitors" onRefresh={() => q.refetch()}>
      {connected.length === 0 ? (
        <EmptyState icon="social" title="Connect Instagram or YouTube" body="Competitor tracking compares your Instagram or YouTube account with up to 3 public accounts." />
      ) : (
        <>
          <ProviderSwitch providers={connected} value={provider} onChange={setPicked} />
          {q.isPending ? (
            <SkeletonCard lines={4} />
          ) : q.isError ? (
            <Failed error={q.error} retry={() => q.refetch()} />
          ) : (
            <>
              <Panel title="You vs. competitors" note="30D">
                <View style={styles.tableHead}>
                  <View style={{ flex: 1 }} />
                  {["Followers", "Eng.", "Posts/wk"].map((h) => (
                    <Text key={h} style={[text.label, styles.num]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {h}
                    </Text>
                  ))}
                </View>
                {me && mine ? <Row name="You" handle={me.handle} avatar={me.avatarUrl} followers={me.followers} eng={mine.engagementRate} posts={mine.postsPerWeek} you /> : null}
                {rivals.map((c) => (
                  <Row key={c.id} name={c.name} handle={c.handle} avatar={c.avatarUrl} followers={c.followers} eng={c.engagementRate} posts={c.postsPerWeek} />
                ))}
                {note ? (
                  <View style={styles.note}>
                    <Icon name="sparkle" size={14} color={colors.emeraldBright} />
                    <Text style={[type(13, "regular", { lineHeight: 1.45 }), { flex: 1 }]}>{note}</Text>
                  </View>
                ) : (
                  <Text style={text.caption}>Add a competitor on {PROVIDER_LABEL[provider]} to compare.</Text>
                )}
              </Panel>
              {q.data && !q.data.enabled ? <Text style={text.caption}>Competitor tracking isn’t available right now. Accounts you track keep their history.</Text> : null}
              <Text style={text.label} accessibilityRole="header">
                Tracked · {total} of {max}
              </Text>
              {(q.data?.competitors ?? []).map((c) => (
                <View key={c.id} style={styles.tracked}>
                  <Avatar name={c.name} source={c.avatarUrl ? imageSource(c.avatarUrl) : null} size={40} decorative />
                  <View style={{ flex: 1 }}>
                    <Text style={type(15, "semibold")}>{c.name}</Text>
                    <Text style={type(12, "regular", { color: colors.fgMuted })}>
                      {PROVIDER_LABEL[c.provider]} · synced {whenEdited(c.lastSyncedAt).toLowerCase()}
                    </Text>
                  </View>
                  <View style={[styles.change, { backgroundColor: statusTint(c.followerChange >= 0 ? colors.emeraldBright : colors.warning) }]}>
                    <Text style={type(11, "semibold", { color: c.followerChange >= 0 ? colors.emeraldBright : colors.warning })}>
                      {c.followerChange >= 0 ? "+" : "−"}
                      {Math.abs(c.followerChange)}% followers
                    </Text>
                  </View>
                  <Pressable onPress={() => setRemoving(c.id)} accessibilityRole="button" accessibilityLabel={`Stop tracking ${c.name}`} hitSlop={4} style={styles.more}>
                    <Icon name="close" size={16} color={colors.fgMuted} />
                  </Pressable>
                </View>
              ))}
              {total < max && q.data?.enabled !== false ? (
                <Pressable onPress={() => setAdding(true)} accessibilityRole="button" accessibilityLabel="Add competitor" style={({ pressed }) => [styles.add, pressed && { backgroundColor: colors.surface2 }]}>
                  <Icon name="plus" size={16} color={colors.emeraldBright} />
                  <Text style={type(14, "semibold")}>Add competitor</Text>
                </Pressable>
              ) : null}
              <Text style={text.caption}>Track up to {max} public Instagram or YouTube accounts. Public stats only, refreshed daily.</Text>
            </>
          )}
        </>
      )}
      <BottomSheet visible={adding} onClose={() => setAdding(false)} title={`Add competitor · ${PROVIDER_LABEL[provider]}`}>
        <TextField
          label="Public handle"
          leadingIcon="person"
          value={handle}
          onChangeText={(t) => (setHandle(t), setError(undefined))}
          placeholder="@creator"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={add}
          error={error}
        />
        <Button label="Start tracking" variant="secondary" size="sm" fullWidth loading={busy} onPress={add} />
      </BottomSheet>
      <ConfirmSheet
        visible={!!removing}
        title="Stop tracking?"
        body="Its history is kept for 30 days in case you add it back."
        confirmLabel="Stop tracking"
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove(removing)}
      />
    </AnalyticsShell>
  );
}

function Row({ name, handle, avatar, followers, eng, posts, you = false }: { name: string; handle: string; avatar: string | null; followers: number; eng: number; posts: number; you?: boolean }) {
  return (
    <View style={styles.tableRow} accessible accessibilityLabel={`${name} ${handle}: ${compact(followers)} followers, ${eng}% engagement, ${posts} posts a week`}>
      <View style={styles.who}>
        <Avatar name={name} source={avatar ? imageSource(avatar) : null} size={28} decorative />
        <View style={{ flex: 1 }}>
          <Text style={type(13, "semibold", { color: you ? colors.emeraldBright : colors.fg })} numberOfLines={1}>
            {name}
          </Text>
          <Text style={type(11, "regular", { color: colors.fgSubtle })} numberOfLines={1}>
            {handle}
          </Text>
        </View>
      </View>
      <Text style={[type(13, "semibold"), styles.num]}>{compact(followers)}</Text>
      <Text style={[type(13, "semibold"), styles.num]}>{eng}%</Text>
      <Text style={[type(13, "semibold"), styles.num]}>{posts.toFixed(1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowStart: { flexDirection: "row", alignItems: "center", gap: 10 },
  account: { flex: 1, gap: 8, padding: 12, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  accountHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  summary: { gap: 12, padding: 16, borderRadius: radius.card, backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.tintBorder },
  summaryHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: { width: "46%", flexGrow: 1, height: 44, borderRadius: 12, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  gender: { flexDirection: "row", height: 8, borderRadius: radius.pill, overflow: "hidden", gap: 2 },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  bestPill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.tint },
  providers: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  provider: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingLeft: 6, paddingRight: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong },
  providerOn: { backgroundColor: colors.tint, borderColor: colors.emeraldBright },
  tableHead: { flexDirection: "row", alignItems: "center" },
  tableRow: { flexDirection: "row", alignItems: "center", minHeight: 52, borderTopWidth: 1, borderTopColor: colors.line },
  who: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  num: { width: 66, paddingLeft: 8, textAlign: "right" },
  note: { flexDirection: "row", gap: 8, padding: 12, borderRadius: radius.tile, backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.tintBorder },
  tracked: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  change: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  more: { width: 36, height: 44, alignItems: "center", justifyContent: "center" },
  add: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 52, borderRadius: radius.card, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.lineStrong },
});
