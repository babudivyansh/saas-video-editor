import { PROVIDER_LABEL, PROVIDERS, compact, monthGrid, type ScheduledPost } from "@clipiro/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, BottomSheet, Button, ConfirmSheet, EmptyState, Header, Icon, IconButton, SegmentedControl, SkeletonCard, StatusBadge, StatusBarScrim, useToast } from "@/components";
import { imageSource } from "@/lib/images";
import { useScreenPadding } from "@/navigation/insets";
import { colors, layout, radius, text, type } from "@/theme";
import { errorMessage } from "@mocks/core";
import { deletePost, retryPost } from "@mocks/social";
import { useSocialAccounts } from "../insights/queries";
import { dayKey, socialKeys, timeLabel, useComposerSeed, usePosts } from "./queries";

type Tab = "accounts" | "calendar" | "scheduled";
const TABS = [
  { value: "accounts", label: "Accounts" },
  { value: "calendar", label: "Calendar" },
  { value: "scheduled", label: "Scheduled" },
] as const;
const HREF: Record<Tab, Href> = { accounts: "/social", calendar: "/social/content-calendar", scheduled: "/social/scheduled-posts" };

export function newPost(date: Date | null = null) {
  useComposerSeed.getState().seed({ date: date?.toISOString() ?? null });
  router.push("/composer");
}

// Frame of design/screens/BN-Accounts, BN-Calendar, BN-Scheduled.
function Shell({ tab, children, onRefresh }: { tab: Tab; children: ReactNode; onRefresh: () => Promise<unknown> }) {
  const pad = useScreenPadding();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, pad, { paddingBottom: pad.paddingBottom + 64 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await onRefresh();
              setRefreshing(false);
            }}
            tintColor={colors.emeraldBright}
            colors={[colors.emeraldBright]}
            progressBackgroundColor={colors.surface2}
          />
        }
      >
        <Header title="Social Studio" large actions={<IconButton icon="chart" accessibilityLabel="Insights" onPress={() => router.push("/social/insights")} />} />
        <SegmentedControl accessibilityLabel="Social Studio" options={TABS} value={tab} onChange={(t) => t !== tab && router.replace(HREF[t])} />
        {children}
      </ScrollView>
      <StatusBarScrim />
      <Pressable
        onPress={() => newPost()}
        accessibilityRole="button"
        accessibilityLabel="New post"
        style={({ pressed }) => [styles.fab, { bottom: layout.tabBar.height + layout.tabBar.inset + insets.bottom + 14 }, pressed && { backgroundColor: colors.primaryPress }]}
      >
        <Icon name="plus" size={18} color={colors.onPrimary} strokeWidth={2.4} />
        <Text style={type(15, "semibold", { color: colors.onPrimary })}>New post</Text>
      </Pressable>
    </View>
  );
}

// ── Accounts ──────────────────────────────────────────────────────────────

export function AccountsScreen() {
  const toast = useToast();
  const accounts = useSocialAccounts();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  const sync = async (id: string) => {
    setSyncing(id);
    await accounts.refetch();
    setSyncing(null);
    toast("Synced.", "success");
  };

  return (
    <Shell tab="accounts" onRefresh={() => accounts.refetch()}>
      {accounts.isPending ? (
        <>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </>
      ) : accounts.isError ? (
        <EmptyState tone="error" title="Couldn’t load your accounts" body={errorMessage(accounts.error)} action={{ label: "Try again", onPress: () => accounts.refetch() }} />
      ) : (
        <>
          {accounts.data.length === 0 ? (
            <EmptyState icon="social" title="No accounts connected" body="Connect YouTube to schedule Shorts and see how they do. Instagram and Facebook can be tracked too." />
          ) : (
            accounts.data.map((a) => {
              const bad = a.health === "reconnect";
              return (
                <View key={a.id} style={styles.card}>
                  <View style={styles.cardHead}>
                    <Avatar name={a.name} source={a.avatarUrl ? imageSource(a.avatarUrl) : null} size={44} decorative />
                    <View style={{ flex: 1 }}>
                      <Text style={type(16, "bold")}>{PROVIDER_LABEL[a.provider]}</Text>
                      <Text style={type(12, "regular", { color: colors.fgMuted })}>
                        {a.provider === "facebook" ? `${a.name} · Page` : a.handle}
                      </Text>
                    </View>
                    {bad ? <StatusBadge label="Reconnect" tone="warning" /> : <StatusBadge label="Healthy" tone="success" />}
                  </View>
                  <View style={styles.cardRow}>
                    <Text style={type(22, "heavy")}>
                      {compact(a.followers)} <Text style={type(12, "regular", { color: colors.fgMuted })}>followers</Text>
                    </Text>
                    <Text style={type(11, "regular", { color: bad ? colors.warning : colors.fgSubtle })}>{bad ? "Token expired" : `Synced ${syncAgo(a.lastSyncedAt)}`}</Text>
                  </View>
                  <View style={styles.cardRow}>
                    {bad ? (
                      <Pressable onPress={() => setConnecting(a.provider)} accessibilityRole="button" accessibilityLabel={`Reconnect ${PROVIDER_LABEL[a.provider]}`} style={[styles.pill, styles.warnPill]}>
                        <Text style={type(14, "semibold", { color: colors.warning })}>Reconnect</Text>
                      </Pressable>
                    ) : (
                      <Button label="Sync now" variant="secondary" size="md" loading={syncing === a.id} onPress={() => sync(a.id)} style={{ flex: 1 }} accessibilityLabel={`Sync ${PROVIDER_LABEL[a.provider]} now`} />
                    )}
                    <Button label="Analytics" variant="secondary" size="md" onPress={() => router.push("/social/insights/platform-analytics")} style={{ flex: 1 }} accessibilityLabel={`${PROVIDER_LABEL[a.provider]} analytics`} />
                  </View>
                </View>
              );
            })
          )}
          <Text style={text.label} accessibilityRole="header">
            {accounts.data.length ? "Add another account" : "Connect an account"}
          </Text>
          <View style={styles.addRow}>
            {PROVIDERS.map((p) => (
              <Pressable key={p} onPress={() => setConnecting(p)} accessibilityRole="button" accessibilityLabel={`Connect ${PROVIDER_LABEL[p]}`} style={({ pressed }) => [styles.add, pressed && { backgroundColor: colors.surface2 }]}>
                <Icon name="plus" size={18} color={colors.emeraldBright} />
                <Text style={type(12, "medium")}>{PROVIDER_LABEL[p]}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      <BottomSheet visible={!!connecting} onClose={() => setConnecting(null)} title={`Connect ${connecting ? PROVIDER_LABEL[connecting as "youtube"] : ""}`}>
        <Text style={type(14, "regular", { color: colors.fgMuted, lineHeight: 1.5 })}>
          Connecting opens {connecting === "youtube" ? "Google" : "Meta"} to sign in. That arrives with real sign-in in the app (Phase 6). For now, connect it on clipiro.com and it shows up here.
        </Text>
        <Button label="Got it" variant="secondary" size="sm" fullWidth onPress={() => setConnecting(null)} />
      </BottomSheet>
    </Shell>
  );
}

function syncAgo(iso: string | null) {
  if (!iso) return "never";
  const h = Math.round((new Date().getTime() - new Date(iso).getTime()) / 3600_000);
  return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

// ── Calendar ──────────────────────────────────────────────────────────────

const DOW = ["M", "T", "W", "T", "F", "S", "S"];

export function CalendarScreen() {
  const posts = usePosts();
  const { width } = useWindowDimensions();
  const [today] = useState(() => new Date());
  const [month, setMonth] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() }));
  const [selected, setSelected] = useState(() => today.getDate());
  const cell = Math.floor((width - 32 - 24) / 7);

  const grid = monthGrid(month.y, month.m);
  const byDay = new Map<string, ScheduledPost[]>();
  for (const p of posts.data ?? []) {
    if (p.status === "failed") continue;
    const k = dayKey(new Date(p.scheduledAt));
    byDay.set(k, [...(byDay.get(k) ?? []), p]);
  }
  const dayPosts = (d: number) => (byDay.get(dayKey(new Date(month.y, month.m, d))) ?? []).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const shift = (n: number) => {
    const d = new Date(month.y, month.m + n, 1);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
    setSelected(1);
  };
  const title = new Date(month.y, month.m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const sel = new Date(month.y, month.m, selected);
  const list = dayPosts(selected);
  const isToday = (d: number) => d === today.getDate() && month.m === today.getMonth() && month.y === today.getFullYear();

  return (
    <Shell tab="calendar" onRefresh={() => posts.refetch()}>
      <View style={styles.monthHead}>
        <IconButton icon="back" accessibilityLabel="Previous month" onPress={() => shift(-1)} />
        <Text style={[type(17, "bold"), { flex: 1, textAlign: "center" }]} accessibilityRole="header">
          {title}
        </Text>
        <IconButton icon="arrowRight" accessibilityLabel="Next month" onPress={() => shift(1)} />
      </View>
      <View style={styles.calendar}>
        <View style={styles.week}>
          {DOW.map((d, i) => (
            <Text key={i} style={[type(11, "regular", { color: colors.fgSubtle }), { width: cell, textAlign: "center" }]}>
              {d}
            </Text>
          ))}
        </View>
        {Array.from({ length: Math.ceil(grid.length / 7) }, (_, r) => (
          <View key={r} style={styles.week}>
            {Array.from({ length: 7 }, (_, c) => {
              const d = grid[r * 7 + c];
              if (!d) return <View key={c} style={{ width: cell }} />;
              const ps = dayPosts(d);
              const on = d === selected;
              return (
                <Pressable
                  key={c}
                  onPress={() => setSelected(d)}
                  accessibilityRole="button"
                  aria-selected={on}
                  accessibilityLabel={`${new Date(month.y, month.m, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}, ${ps.length} post${ps.length === 1 ? "" : "s"}`}
                  style={[styles.day, { width: cell, minHeight: Math.max(48, cell + 8) }, on && styles.dayOn]}
                >
                  <Text style={type(13, on ? "bold" : "medium", { color: on ? colors.bg : isToday(d) ? colors.emeraldBright : colors.fg })}>{d}</Text>
                  {ps[0] ? <Image source={imageSource(ps[0].thumbnailUrl)} style={styles.dayThumb} contentFit="cover" /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.dayHead}>
        <Text style={text.label} accessibilityRole="header">
          {sel.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {list.length} post{list.length === 1 ? "" : "s"}
        </Text>
        <Pressable onPress={() => newPost(new Date(month.y, month.m, selected, 18))} accessibilityRole="button" accessibilityLabel="Add a post on this day" style={styles.link}>
          <Text style={type(13, "semibold", { color: colors.emeraldBright })}>+ Add</Text>
        </Pressable>
      </View>
      {posts.isError ? (
        <EmptyState tone="error" title="Couldn’t load your posts" body={errorMessage(posts.error)} action={{ label: "Try again", onPress: () => posts.refetch() }} />
      ) : list.length ? (
        list.map((p) => <PostRow key={p.id} p={p} time />)
      ) : (
        <Text style={[text.caption, { paddingVertical: 12 }]}>Nothing planned. Tap + Add to schedule a clip.</Text>
      )}
    </Shell>
  );
}

// ── Scheduled ─────────────────────────────────────────────────────────────

export function ScheduledScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const posts = usePosts();
  const [today] = useState(() => new Date());
  const [deleting, setDeleting] = useState<string | null>(null);
  const [open, setOpen] = useState<ScheduledPost | null>(null);

  const all = posts.data ?? [];
  const count = (s: ScheduledPost["status"]) => all.filter((p) => p.status === s).length;
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const groups: [string, ScheduledPost[]][] = [
    ["Today", all.filter((p) => p.status === "scheduled" && dayKey(new Date(p.scheduledAt)) === dayKey(today))],
    ["Tomorrow", all.filter((p) => p.status === "scheduled" && dayKey(new Date(p.scheduledAt)) === dayKey(tomorrow))],
    ["Later", all.filter((p) => p.status === "scheduled" && new Date(p.scheduledAt) >= new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate() + 1))],
    ["Earlier", all.filter((p) => p.status !== "scheduled").sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)).slice(0, 5)],
  ];

  const act = async (fn: () => Promise<void>, done: string) => {
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: socialKeys.posts });
      toast(done, "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <Shell tab="scheduled" onRefresh={() => posts.refetch()}>
      {posts.isPending ? (
        <SkeletonCard lines={4} />
      ) : posts.isError ? (
        <EmptyState tone="error" title="Couldn’t load your posts" body={errorMessage(posts.error)} action={{ label: "Try again", onPress: () => posts.refetch() }} />
      ) : all.length === 0 ? (
        <EmptyState icon="calendar" title="Nothing scheduled yet" body="Pick a ready clip and schedule it for YouTube Shorts." action={{ label: "New post", onPress: () => newPost() }} />
      ) : (
        <>
          <View style={styles.counts}>
            {(
              [
                ["Scheduled", count("scheduled")],
                ["Posted", count("posted")],
                ["Failed", count("failed")],
              ] as const
            ).map(([l, n]) => (
              <View key={l} style={styles.count} accessible accessibilityLabel={`${n} ${l.toLowerCase()}`}>
                <Text style={text.label}>{l}</Text>
                <Text style={type(26, "bold")}>{n}</Text>
              </View>
            ))}
          </View>
          {groups.map(([label, ps]) =>
            ps.length ? (
              <View key={label} style={{ gap: 10 }}>
                <Text style={text.label} accessibilityRole="header">
                  {label}
                </Text>
                {ps.map((p) => (
                  <PostRow
                    key={p.id}
                    p={p}
                    action={
                      p.status === "scheduled"
                        ? { label: "Edit", onPress: () => setOpen(p) }
                        : p.status === "failed"
                          ? { label: "Retry", onPress: () => act(() => retryPost(p.id), "Rescheduled for 5 minutes from now.") }
                          : { label: "View", onPress: () => toast("Opens on YouTube once posting is live.", "info") }
                    }
                  />
                ))}
              </View>
            ) : null,
          )}
        </>
      )}
      <BottomSheet visible={!!open} onClose={() => setOpen(null)} title={open?.title}>
        <Text style={text.caption}>
          {open ? `${new Date(open.scheduledAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${timeLabel(open.scheduledAt)} · YouTube Shorts` : ""}
        </Text>
        <Button
          label="Edit in composer"
          variant="secondary"
          size="sm"
          fullWidth
          onPress={() => {
            useComposerSeed.getState().seed({ date: open?.scheduledAt, clipId: open?.clipId });
            setOpen(null);
            router.push("/composer");
          }}
        />
        <Button label="Delete scheduled post" variant="danger" size="sm" fullWidth onPress={() => (setDeleting(open?.id ?? null), setOpen(null))} />
      </BottomSheet>
      <ConfirmSheet
        visible={!!deleting}
        title="Delete this scheduled post?"
        body="It won't be posted. The clip stays in your project."
        confirmLabel="Delete"
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          const id = deleting;
          setDeleting(null);
          if (id) act(() => deletePost(id), "Scheduled post deleted.");
        }}
      />
    </Shell>
  );
}

function PostRow({ p, time = false, action }: { p: ScheduledPost; time?: boolean; action?: { label: string; onPress: () => void } }) {
  const when = new Date(p.scheduledAt);
  const meta = p.status === "scheduled" ? `Shorts · ${timeLabel(p.scheduledAt)}` : `Shorts · ${when.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  return (
    <View style={styles.post} accessible={!action} accessibilityLabel={`${p.title}, ${meta}, ${p.status}${p.failureReason ? `. ${p.failureReason}` : ""}`}>
      {time ? <Text style={[type(12, "medium", { mono: true, color: colors.emeraldBright }), { width: 70 }]}>{timeLabel(p.scheduledAt)}</Text> : null}
      <Image source={imageSource(p.thumbnailUrl)} style={styles.postThumb} contentFit="cover" />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={type(14, "semibold")} numberOfLines={2}>
          {p.title}
        </Text>
        <Text style={type(12, "regular", { color: colors.fgMuted })}>{time ? "Shorts" : meta}</Text>
        {p.failureReason ? <Text style={type(11, "regular", { color: colors.error })}>{p.failureReason}</Text> : null}
      </View>
      {action ? (
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <StatusBadge label={p.status === "scheduled" ? "Scheduled" : p.status === "posted" ? "Posted" : "Failed"} tone={p.status === "scheduled" ? "success" : p.status === "posted" ? "info" : "error"} />
          <Pressable onPress={action.onPress} accessibilityRole="button" accessibilityLabel={`${action.label} ${p.title}`} style={styles.link}>
            <Text style={type(13, "semibold", { color: colors.emeraldBright })}>{action.label}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 12 },
  fab: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  card: { gap: 12, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  pill: { flex: 1, minHeight: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  warnPill: { borderColor: colors.warning },
  addRow: { flexDirection: "row", gap: 10 },
  add: { flex: 1, minHeight: 72, gap: 6, alignItems: "center", justifyContent: "center", borderRadius: radius.tile, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.lineStrong },
  monthHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  calendar: { gap: 4, padding: 12, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  week: { flexDirection: "row", justifyContent: "space-between" },
  day: { alignItems: "center", paddingVertical: 6, gap: 4, borderRadius: 12 },
  dayOn: { backgroundColor: colors.emeraldBright },
  dayThumb: { width: 20, height: 20, borderRadius: 5 },
  dayHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  link: { minHeight: 44, justifyContent: "center", paddingLeft: 10 },
  post: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  postThumb: { width: 44, height: 62, borderRadius: 8 },
  counts: { flexDirection: "row", gap: 10 },
  count: { flex: 1, gap: 6, padding: 14, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
});
