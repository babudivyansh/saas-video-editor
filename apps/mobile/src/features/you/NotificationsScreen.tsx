import {
  notificationCategory,
  type AppNotification,
  type NotificationCategory,
} from "@clipiro/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Button,
  EmptyState,
  FilterPills,
  SkeletonCard,
  useToast,
  type IconName,
} from "@/components";
import { imageSource } from "@/lib/images";
import { colors, radius, type } from "@/theme";
import { markAllRead, markRead } from "@mocks/account";
import { errorMessage } from "@mocks/core";
import { IconChip, Label, Page } from "./bits";
import { useNotifications, youKeys } from "./queries";

type Filter = "all" | NotificationCategory;
const FILTERS = [
  { value: "all", label: "All" },
  { value: "renders", label: "Renders" },
  { value: "social", label: "Social" },
  { value: "account", label: "Account" },
] as const;

/** Icon and colour per notification type (lib/notify.ts types + Social's). */
function glyph(t: string): { name: IconName; color: string } {
  if (
    t === "autoclip_render_failed" ||
    t === "billing_payment_failed" ||
    t === "billing_subscription_halted"
  )
    return { name: "alert", color: colors.error };
  if (t === "social_reconnect") return { name: "alert", color: colors.warning };
  if (t === "social_post_published") return { name: "send", color: colors.info };
  if (t === "social_weekly_summary") return { name: "chart", color: colors.emeraldBright };
  if (t === "referral_reward") return { name: "gift", color: colors.emeraldBright };
  if (t === "product_update") return { name: "bolt", color: colors.fg };
  if (t.startsWith("review")) return { name: "star", color: colors.emeraldBright };
  if (t.startsWith("billing")) return { name: "card", color: colors.emeraldBright };
  return { name: "bell", color: colors.emeraldBright };
}

function ago(iso: string, now: Date) {
  const min = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `${Math.max(1, min)}m`;
  if (min < 24 * 60) return `${Math.round(min / 60)}h`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// design/screens/BN-Notifications.
export function NotificationsScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const list = useNotifications();
  const [filter, setFilter] = useState<Filter>("all");
  const [now] = useState(() => new Date());

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: youKeys.notifications }),
      qc.invalidateQueries({ queryKey: youKeys.account }),
    ]);
  const unread = (list.data ?? []).filter((n) => !n.readAt).length;

  const open = async (n: AppNotification) => {
    if (!n.readAt) {
      markRead(n.id)
        .then(refresh)
        .catch(() => undefined);
    }
    if (n.href) router.push(n.href as Href);
  };

  const readAll = async () => {
    try {
      await markAllRead();
      await refresh();
      toast("All caught up.", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const shown = (list.data ?? []).filter(
    (n) => filter === "all" || notificationCategory(n.type) === filter
  );
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const groups: [string, AppNotification[]][] = [
    ["Today", shown.filter((n) => new Date(n.createdAt).getTime() >= startOfToday)],
    ["Earlier", shown.filter((n) => new Date(n.createdAt).getTime() < startOfToday)],
  ];

  return (
    <Page
      title="Notifications"
      onRefresh={() => list.refetch()}
      actions={
        unread ? (
          <Pressable onPress={readAll} accessibilityRole="button" style={styles.link}>
            <Text style={type(14, "semibold", { color: colors.emeraldBright })}>Mark all read</Text>
          </Pressable>
        ) : undefined
      }
    >
      <FilterPills
        accessibilityLabel="Show"
        options={FILTERS}
        value={filter}
        onChange={setFilter}
      />
      {list.isPending ? (
        <SkeletonCard lines={4} />
      ) : list.isError ? (
        <EmptyState
          tone="error"
          title="Couldn’t load notifications"
          body={errorMessage(list.error)}
          action={{ label: "Try again", onPress: () => list.refetch() }}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon="bell"
          title={filter === "all" ? "You’re all caught up" : "Nothing here yet"}
          body="Finished renders, posts and account news show up here."
        />
      ) : (
        groups.map(([label, items]) =>
          items.length ? (
            <View key={label} style={{ gap: 10 }}>
              <Label>{label}</Label>
              <View style={styles.group}>
                {items.map((n, i) => {
                  const g = glyph(n.type);
                  return (
                    <Pressable
                      key={n.id}
                      onPress={() => open(n)}
                      accessibilityRole="button"
                      accessibilityLabel={`${n.readAt ? "" : "Unread. "}${n.title}. ${n.body ?? ""} ${ago(n.createdAt, now)}`}
                      style={({ pressed }) => [
                        styles.row,
                        i > 0 && styles.divider,
                        !n.readAt && styles.unread,
                        pressed && { backgroundColor: colors.surface3 },
                      ]}
                    >
                      {n.thumbnailUrl ? (
                        <Image
                          source={imageSource(n.thumbnailUrl)}
                          style={styles.thumb}
                          contentFit="cover"
                        />
                      ) : (
                        <IconChip name={g.name} color={g.color} />
                      )}
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={type(15, "semibold")} numberOfLines={2}>
                          {n.title}
                        </Text>
                        {n.body ? (
                          <Text
                            style={type(13, "regular", { color: colors.fgMuted })}
                            numberOfLines={2}
                          >
                            {n.body}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.meta}>
                        <Text style={type(12, "regular", { color: colors.fgSubtle })}>
                          {ago(n.createdAt, now)}
                        </Text>
                        {n.readAt ? null : <View style={styles.dot} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null
        )
      )}
      <Button
        label="Notification settings"
        icon="gear"
        variant="secondary"
        size="lg"
        fullWidth
        onPress={() => router.push("/you/settings")}
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: 44, justifyContent: "center", paddingLeft: 8 },
  group: {
    borderRadius: radius.card,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 68, padding: 14 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  unread: { backgroundColor: colors.tint },
  thumb: { width: 40, height: 40, borderRadius: 10 },
  meta: { alignItems: "flex-end", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.emeraldBright },
});
