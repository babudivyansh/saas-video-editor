import { PLANS, type Account } from "@clipiro/shared";
import { useQueryClient } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  Avatar,
  BottomSheet,
  Button,
  ConfirmSheet,
  EmptyState,
  Header,
  Icon,
  IconButton,
  ListGroup,
  ListRow,
  ProgressBar,
  SkeletonCard,
  StatusBarScrim,
  TextField,
  useToast,
  type IconName,
} from "@/components";
import { imageSource } from "@/lib/images";
import { useScreenPadding } from "@/navigation/insets";
import { useSession } from "@/state/session";
import { colors, radius, statusTint, text, type, withAlpha } from "@/theme";
import { errorMessage } from "@mocks/core";
import { updateName } from "@mocks/account";
import { IconChip, Label, ReferralSheet } from "./bits";
import { useAccount, youKeys } from "./queries";

export const planName = (a: Account) => PLANS.find((p) => p.tier === a.plan.tier)?.name ?? "Free";
export const termName = (a: Account) =>
  a.plan.term === "yearly" ? "Yearly" : a.plan.term === "monthly" ? "Monthly" : null;
const n = (v: number) => v.toLocaleString("en-US");

// design/screens/BN-Profile.
export function ProfileScreen() {
  const pad = useScreenPadding();
  const toast = useToast();
  const qc = useQueryClient();
  const account = useAccount();
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [referral, setReferral] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const saveName = async () => {
    setSaving(true);
    try {
      await updateName(name);
      await qc.invalidateQueries({ queryKey: youKeys.account });
      setEditing(false);
      toast("Name updated.", "success");
    } catch (e) {
      setNameError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const go = (href: Href) => () => router.push(href);
  const a = account.data;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, pad]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await account.refetch();
              setRefreshing(false);
            }}
            tintColor={colors.emeraldBright}
            colors={[colors.emeraldBright]}
            progressBackgroundColor={colors.surface2}
          />
        }
      >
        <Header
          title="You"
          large
          actions={
            <IconButton icon="gear" accessibilityLabel="Settings" onPress={go("/you/settings")} />
          }
        />
        {account.isPending ? (
          <>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={3} />
          </>
        ) : account.isError || !a ? (
          <EmptyState
            tone="error"
            title="Couldn’t load your account"
            body={errorMessage(account.error)}
            action={{ label: "Try again", onPress: () => account.refetch() }}
          />
        ) : (
          <>
            <View style={styles.card}>
              <Avatar
                name={a.user.name}
                source={a.user.avatarUrl ? imageSource(a.user.avatarUrl) : null}
                size={72}
                decorative
              />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={type(20, "bold")} numberOfLines={1}>
                  {a.user.name}
                </Text>
                <Text style={type(13, "regular", { color: colors.fgMuted })} numberOfLines={1}>
                  {a.user.email}
                </Text>
                <Text
                  style={type(11, "regular", { mono: true, color: colors.fgSubtle })}
                  accessibilityLabel={`User ID ${a.user.id}`}
                >
                  UID {a.user.id.slice(0, 8)}…
                </Text>
              </View>
              <IconButton
                icon="pencil"
                accessibilityLabel="Edit name"
                onPress={() => {
                  setName(a.user.name);
                  setNameError(undefined);
                  setEditing(true);
                }}
              />
            </View>

            <View style={styles.row}>
              <Pressable
                onPress={go("/you/subscription")}
                accessibilityRole="button"
                accessibilityLabel={`Plan: ${planName(a)}${termName(a) ? `, ${termName(a)}` : ""}. Manage`}
                style={({ pressed }) => [
                  styles.half,
                  styles.planCard,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={text.label}>Plan</Text>
                <Text style={type(18, "bold")}>{planName(a)}</Text>
                <Text style={type(12, "regular", { color: colors.fgMuted })}>
                  {termName(a) ? `${termName(a)} · Manage` : "Upgrade"}
                </Text>
              </Pressable>
              <View
                style={[styles.half, styles.tile]}
                accessible
                accessibilityLabel={`Level ${a.creator.level}, ${n(a.creator.xp)} of ${n(a.creator.nextLevelXp)} XP`}
              >
                <Text style={text.label}>Level</Text>
                <Text
                  style={type(18, "bold")}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {a.creator.level}
                </Text>
                <ProgressBar
                  value={a.creator.xp}
                  max={a.creator.nextLevelXp}
                  height={5}
                  label="XP"
                />
                <Text style={type(12, "regular", { color: colors.fgMuted })}>
                  {n(a.creator.xp)} / {n(a.creator.nextLevelXp)} XP
                </Text>
              </View>
            </View>

            <View style={styles.balances}>
              <View style={styles.row}>
                <Balance
                  label="Clip minutes"
                  value={a.clipMinutes.remaining}
                  max={Math.max(a.clipMinutes.allowance, a.clipMinutes.remaining)}
                  color={colors.emeraldBright}
                />
                <Balance
                  label="AI credits"
                  value={a.aiCredits.remaining}
                  max={Math.max(a.aiCredits.allowance * 2, a.aiCredits.remaining) || 1}
                  color={colors.info}
                  white
                />
              </View>
              <Pressable
                onPress={go("/you/credits")}
                accessibilityRole="button"
                style={styles.link}
              >
                <Text style={type(14, "semibold", { color: colors.emeraldBright })}>
                  View credits & top up
                </Text>
                <Icon name="chevronRight" size={16} color={colors.emeraldBright} />
              </Pressable>
            </View>

            <Label>Your studio</Label>
            <View style={styles.row}>
              <StudioTile icon="mic" label="My Voices" onPress={go("/you/my-voices")} />
              <StudioTile icon="folder" label="My Assets" onPress={go("/projects/assets")} />
              <StudioTile icon="palette" label="Brand Kit" onPress={go("/you/brand-kit")} />
            </View>

            <Label>Account</Label>
            <ListGroup>
              <ListRow
                first
                leading={<IconChip name="bolt" />}
                title="Credits"
                subtitle={`${n(a.aiCredits.remaining)} credits · ${n(a.clipMinutes.remaining)} min`}
                onPress={go("/you/credits")}
              />
              <ListRow
                leading={<IconChip name="card" />}
                title="Subscription"
                subtitle={[planName(a), termName(a)].filter(Boolean).join(" · ")}
                onPress={go("/you/subscription")}
              />
              <ListRow
                leading={<IconChip name="bell" />}
                title="Notifications"
                subtitle={
                  a.unreadNotifications ? `${a.unreadNotifications} unread` : "All caught up"
                }
                onPress={go("/you/notifications")}
              />
              <ListRow
                leading={<IconChip name="gear" />}
                title="Settings"
                subtitle="Preferences, security, API keys"
                onPress={go("/you/settings")}
              />
              <ListRow
                leading={<IconChip name="gift" />}
                title="Earn credits"
                subtitle={`${a.referralPercent}% recurring on referrals`}
                onPress={() => setReferral(true)}
              />
            </ListGroup>

            <Label>Support</Label>
            <ListGroup>
              <ListRow
                first
                leading={<IconChip name="help" />}
                title="Help & Support"
                onPress={go("/you/help-support")}
              />
              <ListRow
                leading={<IconChip name="file" />}
                title="Legal"
                onPress={go("/you/legal")}
              />
            </ListGroup>

            <Pressable
              onPress={() => setLoggingOut(true)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.logout,
                pressed && { backgroundColor: statusTint(colors.error) },
              ]}
            >
              <Icon name="logout" size={18} color={colors.error} />
              <Text style={type(15, "semibold", { color: colors.error })}>Log out</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
      <StatusBarScrim />

      <BottomSheet visible={editing} onClose={() => setEditing(false)} title="Edit name">
        <TextField
          label="Name"
          value={name}
          onChangeText={(t) => (setName(t), setNameError(undefined))}
          error={nameError}
          autoCapitalize="words"
          autoComplete="name"
        />
        <Button label="Save" size="sm" fullWidth loading={saving} onPress={saveName} />
      </BottomSheet>

      <ReferralSheet
        visible={referral}
        onClose={() => setReferral(false)}
        percent={a?.referralPercent ?? 20}
      />

      <ConfirmSheet
        visible={loggingOut}
        title="Log out?"
        body="You can log back in any time with your email or Google."
        confirmLabel="Log out"
        onClose={() => setLoggingOut(false)}
        onConfirm={() => {
          setLoggingOut(false);
          qc.clear();
          useSession.getState().signOut();
        }}
      />
    </View>
  );
}

function Balance({
  label,
  value,
  max,
  color,
  white = false,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  white?: boolean;
}) {
  return (
    <View style={styles.half} accessible accessibilityLabel={`${n(value)} ${label.toLowerCase()}`}>
      <Text style={text.label}>{label}</Text>
      <Text style={type(26, "heavy", { color: white ? colors.fg : color })}>{n(value)}</Text>
      <ProgressBar value={value} max={max} height={5} color={color} label={label} />
    </View>
  );
}

function StudioTile({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.studio, pressed && { backgroundColor: colors.surface3 }]}
    >
      <Icon name={icon} size={20} color={colors.emeraldBright} />
      <Text style={[type(13, "semibold"), { textAlign: "center" }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 12 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: radius.card,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1, gap: 6 },
  tile: {
    padding: 16,
    borderRadius: radius.card,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  planCard: {
    padding: 16,
    borderRadius: radius.card,
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.tintBorder,
  },
  balances: {
    gap: 4,
    padding: 16,
    borderRadius: radius.card,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  link: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  studio: {
    flex: 1,
    minHeight: 88,
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    borderRadius: radius.tile,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  logout: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
    marginTop: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: withAlpha(colors.error, 0.45),
  },
});
