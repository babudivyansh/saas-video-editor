import { PROVIDER_LABEL, PROVIDERS, compact, isAutoPost, linkPostRequest, monthGrid, type PostStatus, type Provider, type SocialAccount, type SocialPost } from "@clipiro/shared";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, BottomSheet, Button, ConfirmSheet, EmptyState, Header, Icon, IconButton, SegmentedControl, SkeletonCard, StatusBadge, StatusBarScrim, TextField, useToast } from "@/components";
import { imageSource } from "@/lib/images";
import { useScreenPadding } from "@/navigation/insets";
import { colors, layout, radius, text, type } from "@/theme";
import { assets, social } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { SocialUpsell } from "../insights/InsightsShell";
import { isUpsell, useConnectable, useSocialAccounts } from "../insights/queries";
import { GalleryDenied, shareClip, shareVideo } from "../projects/clipFiles";
import { connectAccount, finishConnectReturn, type ConnectOutcome } from "./connect";
import { STATUS, dayKey, dayLabel, platformLabel, socialKeys, timeLabel, useComposerSeed, usePost, usePosts } from "./queries";

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

/** What each platform's sign-in asks for, said before it opens. */
const CONNECT_NOTE: Record<Provider, string> = {
  youtube: "Google asks you to let Clipiro read your channel’s stats and upload the videos you post from Clipiro. Nothing is posted without you.",
  instagram: "Meta asks you to let Clipiro read your Instagram stats. Instagram needs a professional (Business or Creator) account linked to a Facebook Page.",
  facebook: "Meta asks you to let Clipiro read the stats of the Facebook Pages you choose.",
};

export function AccountsScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const accounts = useSocialAccounts();
  const connectable = useConnectable().data;
  const params = useLocalSearchParams<{ connected?: string; error?: string; pending?: string }>();
  const [connecting, setConnecting] = useState<Provider | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<SocialAccount | null>(null);

  const refreshAll = () => Promise.all([qc.invalidateQueries({ queryKey: ["social"] }), qc.invalidateQueries({ queryKey: ["insights"] }), qc.invalidateQueries({ queryKey: ["analytics"] })]);
  const report = (o: ConnectOutcome) => {
    if (o.kind === "connected") {
      toast(`${o.providers.map((p) => PROVIDER_LABEL[p] ?? p).join(" and ")} connected. The first numbers arrive in a minute.`, "success");
      void refreshAll();
    } else if (o.kind === "failed") toast(o.message, "error");
  };

  // Android can also hand the return link to the app itself (clipiro://social?pending=…):
  // finished and said once per arrival (a pending id only works once anyway).
  const announced = useRef<string | null>(null);
  useEffect(() => {
    const key = `${params.connected ?? ""}|${params.error ?? ""}|${params.pending ?? ""}`;
    if (key === "||" || announced.current === key) return;
    announced.current = key;
    void finishConnectReturn({ connected: params.connected, error: params.error, pending: params.pending }).then((o) => o && report(o));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per arrival
  }, [params.connected, params.error, params.pending]);

  const connect = async (p: Provider) => {
    setBusy(true);
    try {
      const o = await connectAccount(p);
      report(o);
      // A refusal or a closed sign-in leaves the sheet open, to try again.
      if (o.kind === "connected") setConnecting(null);
    } catch (e) {
      toast(apiErrorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const sync = async (id: string) => {
    setSyncing(id);
    try {
      await social.syncAccount(id);
      await refreshAll();
      toast("Synced.", "success");
    } catch (e) {
      toast(apiErrorMessage(e), "error");
    } finally {
      setSyncing(null);
    }
  };

  const disconnect = async (a: SocialAccount) => {
    try {
      await social.disconnect(a.id);
      await refreshAll();
      toast(`${PROVIDER_LABEL[a.provider]} disconnected.`, "success");
    } catch (e) {
      toast(apiErrorMessage(e), "error");
    } finally {
      setRemoving(null);
    }
  };
  const available = (p: Provider) => !connectable || connectable.includes(p);

  return (
    <Shell tab="accounts" onRefresh={() => accounts.refetch()}>
      {accounts.isPending ? (
        <>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </>
      ) : accounts.isError ? (
        isUpsell(accounts.error) ? (
          <SocialUpsell />
        ) : (
          <EmptyState tone="error" title="Couldn’t load your accounts" body={apiErrorMessage(accounts.error)} action={{ label: "Try again", onPress: () => accounts.refetch() }} />
        )
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
                    <IconButton icon="close" accessibilityLabel={`Disconnect ${PROVIDER_LABEL[a.provider]}`} onPress={() => setRemoving(a)} />
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
              <Pressable
                key={p}
                onPress={() => (available(p) ? setConnecting(p) : toast(`${PROVIDER_LABEL[p]} can’t be connected right now. Try again later.`, "info"))}
                accessibilityRole="button"
                accessibilityLabel={`Connect ${PROVIDER_LABEL[p]}`}
                aria-disabled={!available(p)}
                style={({ pressed }) => [styles.add, !available(p) && { opacity: 0.45 }, pressed && { backgroundColor: colors.surface2 }]}
              >
                <Icon name="plus" size={18} color={colors.emeraldBright} />
                <Text style={type(12, "medium")}>{PROVIDER_LABEL[p]}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      <BottomSheet visible={!!connecting} onClose={() => !busy && setConnecting(null)} title={`Connect ${connecting ? PROVIDER_LABEL[connecting] : ""}`}>
        <Text style={type(14, "regular", { color: colors.fgMuted, lineHeight: 1.5 })}>{connecting ? CONNECT_NOTE[connecting] : ""}</Text>
        <Button label={`Continue to ${connecting === "youtube" ? "Google" : "Meta"}`} fullWidth loading={busy} onPress={() => connecting && void connect(connecting)} />
        <Button label="Not now" variant="ghost" fullWidth disabled={busy} onPress={() => setConnecting(null)} />
      </BottomSheet>
      <ConfirmSheet
        visible={!!removing}
        title={removing ? `Disconnect ${PROVIDER_LABEL[removing.provider]}?` : ""}
        body="Clipiro stops reading its stats and posting to it. What it already tracked is removed. You can connect it again any time."
        confirmLabel="Disconnect"
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && void disconnect(removing)}
      />
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

/** A month's window, local midnight to the last instant. */
const monthRange = (y: number, m: number) => ({ from: new Date(y, m, 1).toISOString(), to: new Date(y, m + 1, 1, 0, 0, 0, -1).toISOString() });
const ON_CALENDAR = new Set<PostStatus>(["scheduled", "posting", "posted", "your_turn"]);

export function CalendarScreen() {
  const { width } = useWindowDimensions();
  const [today] = useState(() => new Date());
  const [month, setMonth] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() }));
  const [selected, setSelected] = useState(() => today.getDate());
  const [open, setOpen] = useState<SocialPost | null>(null);
  const posts = usePosts(monthRange(month.y, month.m));
  const cell = Math.floor((width - 32 - 24) / 7);

  const grid = monthGrid(month.y, month.m);
  const byDay = new Map<string, SocialPost[]>();
  for (const p of posts.data ?? []) {
    if (!p.scheduledAt || !ON_CALENDAR.has(p.status)) continue;
    const k = dayKey(new Date(p.scheduledAt));
    byDay.set(k, [...(byDay.get(k) ?? []), p]);
  }
  const dayPosts = (d: number) => (byDay.get(dayKey(new Date(month.y, month.m, d))) ?? []).sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
  const shift = (n: number) => {
    const d = new Date(month.y, month.m + n, 1);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
    setSelected(1);
  };
  const title = new Date(month.y, month.m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const sel = new Date(month.y, month.m, selected);
  const list = dayPosts(selected);
  const isToday = (d: number) => d === today.getDate() && month.m === today.getMonth() && month.y === today.getFullYear();

  if (isUpsell(posts.error)) {
    return (
      <Shell tab="calendar" onRefresh={() => posts.refetch()}>
        <SocialUpsell />
      </Shell>
    );
  }
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
              const first = ps[0];
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
                  {first?.thumbnailUrl ? <Image source={imageSource(first.thumbnailUrl)} style={styles.dayThumb} contentFit="cover" /> : first ? <View style={styles.dayDot} /> : null}
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
        <EmptyState tone="error" title="Couldn’t load your posts" body={apiErrorMessage(posts.error)} action={{ label: "Try again", onPress: () => posts.refetch() }} />
      ) : list.length ? (
        list.map((p) => <PostRow key={p.id} p={p} time action={{ label: "Open", onPress: () => setOpen(p) }} />)
      ) : (
        <Text style={[text.caption, { paddingVertical: 12 }]}>Nothing planned. Tap + Add to schedule a video.</Text>
      )}
      <PostSheet post={open} onClose={() => setOpen(null)} />
    </Shell>
  );
}

// ── Scheduled ─────────────────────────────────────────────────────────────

export function ScheduledScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const posts = usePosts();
  const { post: linked } = useLocalSearchParams<{ post?: string }>();
  // A notification's link (?post=) opens that post, once.
  const [deepId] = useState(() => (typeof linked === "string" ? linked : null));
  const deep = usePost(deepId);
  const [today] = useState(() => new Date());
  const [open, setOpen] = useState<SocialPost | null>(null);
  const [shownDeep, setShownDeep] = useState(false);
  if (deep.data && !shownDeep) {
    setShownDeep(true);
    setOpen(deep.data);
  }
  const toldDeepError = useRef(false);
  useEffect(() => {
    if (deep.isError && !toldDeepError.current) {
      toldDeepError.current = true;
      toast(apiErrorMessage(deep.error), "error");
    }
  }, [deep.isError, deep.error, toast]);

  const all = posts.data ?? [];
  const count = (...s: PostStatus[]) => all.filter((p) => s.includes(p.status)).length;
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const later = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2);
  const scheduled = all.filter((p) => p.status === "scheduled" && p.scheduledAt);
  const groups: [string, SocialPost[]][] = [
    ["Your turn", all.filter((p) => p.status === "your_turn")],
    ["Posting now", all.filter((p) => p.status === "posting")],
    ["Today", scheduled.filter((p) => dayKey(new Date(p.scheduledAt!)) === dayKey(today))],
    ["Tomorrow", scheduled.filter((p) => dayKey(new Date(p.scheduledAt!)) === dayKey(tomorrow))],
    ["Later", scheduled.filter((p) => new Date(p.scheduledAt!) >= later)],
    ["Earlier", all.filter((p) => p.status === "posted" || p.status === "failed" || p.status === "missed").sort((a, b) => (b.scheduledAt ?? "").localeCompare(a.scheduledAt ?? "")).slice(0, 10)],
  ];

  const retry = async (p: SocialPost) => {
    try {
      await social.retryPost(p.id);
      await qc.invalidateQueries({ queryKey: socialKeys.posts });
      toast(isAutoPost(p.account.provider) ? `Posting to ${platformLabel(p.account.provider)} again.` : "It’s your turn to post it again.", "success");
    } catch (e) {
      toast(apiErrorMessage(e), "error");
    }
  };

  if (isUpsell(posts.error)) {
    return (
      <Shell tab="scheduled" onRefresh={() => posts.refetch()}>
        <SocialUpsell />
      </Shell>
    );
  }
  return (
    <Shell tab="scheduled" onRefresh={() => posts.refetch()}>
      {posts.isPending ? (
        <SkeletonCard lines={4} />
      ) : posts.isError ? (
        <EmptyState tone="error" title="Couldn’t load your posts" body={apiErrorMessage(posts.error)} action={{ label: "Try again", onPress: () => posts.refetch() }} />
      ) : all.length === 0 ? (
        <EmptyState icon="calendar" title="Nothing scheduled yet" body="Pick a clip or a video from Assets and post it now or later." action={{ label: "New post", onPress: () => newPost() }} />
      ) : (
        <>
          <View style={styles.counts}>
            {(
              [
                ["Scheduled", count("scheduled")],
                ["Posted", count("posted")],
                ["Failed", count("failed", "missed")],
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
                  <PostRow key={p.id} p={p} action={rowAction(p, () => setOpen(p), () => void retry(p))} />
                ))}
              </View>
            ) : null,
          )}
        </>
      )}
      <PostSheet post={open} onClose={() => setOpen(null)} />
    </Shell>
  );
}

function rowAction(p: SocialPost, open: () => void, retry: () => void): { label: string; onPress: () => void } | undefined {
  switch (p.status) {
    case "scheduled":
      return { label: "Edit", onPress: open };
    case "failed":
    case "missed":
      return { label: "Retry", onPress: retry };
    case "your_turn":
      return { label: "Post it", onPress: open };
    case "posted":
      return { label: "View", onPress: open };
    case "posting":
      return undefined;
  }
}

/** The caption as it goes on the platform: text, then hashtags. */
const fullCaption = (p: SocialPost) => [p.caption.trim(), p.hashtags.join(" ")].filter(Boolean).join("\n\n");

/** One post's details and what can be done with it. */
function PostSheet({ post, onClose }: { post: SocialPost | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"share" | "link" | "retry" | null>(null);
  const [confirm, setConfirm] = useState<SocialPost | null>(null);
  const p = post;
  const name = p ? platformLabel(p.account.provider) : "";

  const refresh = () => qc.invalidateQueries({ queryKey: socialKeys.posts });
  const close = () => {
    setLink("");
    setLinkError(null);
    onClose();
  };
  const run = async (kind: "share" | "link" | "retry", fn: () => Promise<string | null>) => {
    setBusy(kind);
    try {
      const msg = await fn();
      if (msg) toast(msg, "success");
    } catch (e) {
      if (kind === "link") setLinkError(apiErrorMessage(e));
      else toast(e instanceof GalleryDenied ? e.message : apiErrorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const share = () =>
    run("share", async () => {
      if (!p) return null;
      const caption = fullCaption(p);
      if (caption) await Clipboard.setStringAsync(caption);
      if (p.clipId) await shareClip(p.clipId, p.title);
      else if (p.assetId) {
        const a = await assets.get(p.assetId);
        if (!a.url) return "This video can’t be shared from here. Download it from Assets.";
        await shareVideo(a.url, `${p.assetId}.mp4`, p.title);
      } else return "The video was deleted, so there’s nothing to share.";
      return caption ? `Caption copied. Paste it in ${name}.` : null;
    });

  const saveLink = () =>
    run("link", async () => {
      if (!p) return null;
      const parsed = linkPostRequest.safeParse({ permalink: link });
      if (!parsed.success) {
        setLinkError(parsed.error.issues[0]?.message ?? "Paste the post’s link");
        return null;
      }
      setLinkError(null);
      await social.linkPost(p.id, parsed.data.permalink);
      await refresh();
      close();
      return "Linked. Its numbers show up in Insights after the next sync.";
    });

  const retry = () =>
    run("retry", async () => {
      if (!p) return null;
      await social.retryPost(p.id);
      await refresh();
      close();
      return isAutoPost(p.account.provider) ? `Posting to ${name} again.` : "It’s your turn to post it again.";
    });

  const remove = async (target: SocialPost) => {
    try {
      await social.deletePost(target.id);
      await refresh();
      toast(target.status === "scheduled" ? "Scheduled post deleted." : "Removed from Clipiro.", "success");
    } catch (e) {
      toast(apiErrorMessage(e), "error");
    }
  };

  const when = p?.scheduledAt ? `${dayLabel(p.scheduledAt)} · ${timeLabel(p.scheduledAt)}` : "";
  const confirmPlatform = confirm ? platformLabel(confirm.account.provider) : "";
  return (
    <>
      <BottomSheet visible={!!p} onClose={close} title={p?.title}>
        {p ? (
          <>
            <View style={styles.sheetMeta}>
              <StatusBadge label={STATUS[p.status].label} tone={STATUS[p.status].tone} />
              <Text style={[text.caption, { flex: 1 }]}>
                {name} · {p.account.name}
                {when ? ` · ${when}` : ""}
              </Text>
            </View>
            {p.failureReason ? <Text style={type(13, "regular", { color: colors.error })}>{p.failureReason}</Text> : null}
            {p.caption || p.hashtags.length ? (
              <Text style={type(13, "regular", { color: colors.fgMuted })} numberOfLines={4}>
                {fullCaption(p)}
              </Text>
            ) : null}

            {p.status === "scheduled" ? (
              <>
                <Button label="Edit post" variant="secondary" size="sm" fullWidth onPress={() => (useComposerSeed.getState().seed({ editId: p.id }), close(), router.push("/composer"))} />
                <Button label="Delete scheduled post" variant="danger" size="sm" fullWidth onPress={() => (setConfirm(p), close())} />
              </>
            ) : p.status === "posting" ? (
              <Text style={text.caption}>Uploading to {name} now. It’ll be live in a few minutes.</Text>
            ) : p.status === "your_turn" ? (
              <>
                <Text style={text.caption}>Share the video to {name} (we copy the caption for you), then paste the post’s link so Clipiro can track it.</Text>
                <Button label={`Share to ${name}`} icon="send" iconPosition="start" size="sm" fullWidth loading={busy === "share"} onPress={share} />
                <TextField label="Post link" value={link} onChangeText={setLink} placeholder={`https://www.${p.account.provider}.com/…`} autoCapitalize="none" autoCorrect={false} keyboardType="url" error={linkError ?? undefined} />
                <Button label="Save link" variant="secondary" size="sm" fullWidth loading={busy === "link"} onPress={saveLink} />
              </>
            ) : p.status === "posted" ? (
              p.permalink ? <Button label={`Open on ${name}`} icon="link" iconPosition="start" variant="secondary" size="sm" fullWidth onPress={() => void Linking.openURL(p.permalink!)} /> : null
            ) : (
              <Button label="Retry now" variant="secondary" size="sm" fullWidth loading={busy === "retry"} onPress={retry} />
            )}
            {p.status !== "scheduled" && p.status !== "posting" ? <Button label="Remove from Clipiro" variant="danger" size="sm" fullWidth onPress={() => (setConfirm(p), close())} /> : null}
          </>
        ) : null}
      </BottomSheet>
      <ConfirmSheet
        visible={!!confirm}
        title={confirm?.status === "scheduled" ? "Delete this scheduled post?" : "Remove this post from Clipiro?"}
        body={confirm?.status === "posted" ? `It stays on ${confirmPlatform}. Clipiro stops tracking it.` : "It won’t be posted. The video stays where it is."}
        confirmLabel={confirm?.status === "scheduled" ? "Delete" : "Remove"}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const target = confirm;
          setConfirm(null);
          if (target) void remove(target);
        }}
      />
    </>
  );
}

function PostRow({ p, time = false, action }: { p: SocialPost; time?: boolean; action?: { label: string; onPress: () => void } }) {
  const name = platformLabel(p.account.provider);
  const day = p.scheduledAt ? new Date(p.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  const meta = p.scheduledAt ? `${name} · ${p.status === "scheduled" ? timeLabel(p.scheduledAt) : day}` : name;
  const status = STATUS[p.status];
  return (
    <View style={styles.post} accessible={!action} accessibilityLabel={`${p.title}, ${meta}, ${status.label}${p.failureReason ? `. ${p.failureReason}` : ""}`}>
      {time && p.scheduledAt ? <Text style={[type(12, "medium", { mono: true, color: colors.emeraldBright }), { width: 70 }]}>{timeLabel(p.scheduledAt)}</Text> : null}
      {p.thumbnailUrl ? <Image source={imageSource(p.thumbnailUrl)} style={styles.postThumb} contentFit="cover" /> : <View style={[styles.postThumb, styles.thumbEmpty]} />}
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={type(14, "semibold")} numberOfLines={2}>
          {p.title}
        </Text>
        <Text style={type(12, "regular", { color: colors.fgMuted })}>{time ? name : meta}</Text>
        {p.failureReason ? (
          <Text style={type(11, "regular", { color: colors.error })} numberOfLines={2}>
            {p.failureReason}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <StatusBadge label={status.label} tone={status.tone} />
        {action ? (
          <Pressable onPress={action.onPress} accessibilityRole="button" accessibilityLabel={`${action.label} ${p.title}`} style={styles.link}>
            <Text style={type(13, "semibold", { color: colors.emeraldBright })}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
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
  dayDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.emeraldBright },
  dayHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  link: { minHeight: 44, justifyContent: "center", paddingLeft: 10 },
  post: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  postThumb: { width: 44, height: 62, borderRadius: 8 },
  thumbEmpty: { backgroundColor: colors.surface3 },
  sheetMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  counts: { flexDirection: "row", gap: 10 },
  count: { flex: 1, gap: 6, padding: 14, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
});
