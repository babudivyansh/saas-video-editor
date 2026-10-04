import {
  CREDIT_PACKS,
  MINUTE_PACKS,
  MONEY_BACK_DAYS,
  PLANS,
  POPULAR_TIER,
  ROLLOVER_MULTIPLIER,
  YEARLY_DISCOUNT_PCT,
  perMonthCents,
  usd,
  type Activity,
} from "@clipiro/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  ConfirmSheet,
  EmptyState,
  Icon,
  ListGroup,
  ListRow,
  ScoreRing,
  SegmentedControl,
  SkeletonCard,
  StatusBadge,
  useToast,
  type IconName,
} from "@/components";
import { colors, radius, text, type } from "@/theme";
import { setCancelAtPeriodEnd } from "@mocks/account";
import { errorMessage } from "@mocks/core";
import { IconChip, Label, Notice, Page, ReferralSheet } from "./bits";
import { planName, termName } from "./ProfileScreen";
import { dayLabel, longDate, useAccount, useActivity, youKeys } from "./queries";

const n = (v: number) => v.toLocaleString("en-US");

// ── Credits (design/screens/BN-Credits) ───────────────────────────────────

const ACTIVITY_ICON: Record<Activity["kind"], IconName> = {
  image: "image",
  autoclip: "scissors",
  voiceover: "volume",
  referral: "gift",
  purchase: "card",
  refund: "refresh",
  other: "bolt",
};

export function CreditsScreen() {
  const account = useAccount();
  const activity = useActivity();
  const [now] = useState(() => new Date());
  const [referral, setReferral] = useState(false);
  const a = account.data;

  return (
    <Page title="Credits" onRefresh={() => Promise.all([account.refetch(), activity.refetch()])}>
      {account.isPending ? (
        <SkeletonCard lines={3} />
      ) : account.isError || !a ? (
        <EmptyState
          tone="error"
          title="Couldn’t load your balance"
          body={errorMessage(account.error)}
          action={{ label: "Try again", onPress: () => account.refetch() }}
        />
      ) : (
        <View style={styles.row}>
          <BalanceRing
            icon="clock"
            value={a.clipMinutes.remaining}
            max={Math.max(a.clipMinutes.allowance, a.clipMinutes.remaining)}
            label="Clip minutes"
            color={colors.emeraldBright}
          />
          <BalanceRing
            icon="bolt"
            value={a.aiCredits.remaining}
            max={Math.max(a.aiCredits.allowance * ROLLOVER_MULTIPLIER, a.aiCredits.remaining) || 1}
            label="AI credits"
            color={colors.info}
          />
        </View>
      )}
      <Text style={text.caption}>
        Subscription credits refill monthly and roll over up to {ROLLOVER_MULTIPLIER}× your
        allowance. Pack credits never expire.
      </Text>

      <Label>Credit packs</Label>
      <View style={styles.grid}>
        {CREDIT_PACKS.map((p) => (
          <View
            key={p.id}
            style={styles.pack}
            accessible
            accessibilityLabel={`${p.name} pack, ${p.credits} credits, ${usd(p.cents)}${"bestValue" in p ? ", best value" : ""}`}
          >
            <View style={styles.packHead}>
              <Text style={type(13, "regular", { color: colors.fgMuted })}>{p.name}</Text>
              {"bestValue" in p ? <StatusBadge label="Best value" tone="success" /> : null}
            </View>
            <Text style={type(19, "bold")}>{p.credits} credits</Text>
            <Text style={type(14, "semibold", { color: colors.emeraldBright })}>
              {usd(p.cents)}
            </Text>
          </View>
        ))}
      </View>

      <Label>Clip minute packs</Label>
      <View style={styles.row}>
        {MINUTE_PACKS.map((p) => (
          <View
            key={p.id}
            style={styles.minutePack}
            accessible
            accessibilityLabel={`${p.minutes} minutes, ${usd(p.cents)}`}
          >
            <Text
              style={type(16, "bold")}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {p.minutes} min
            </Text>
            <Text style={type(12, "semibold", { color: colors.emeraldBright })}>
              {usd(p.cents)}
            </Text>
          </View>
        ))}
      </View>

      <Notice>
        Buying credits and minute packs in the app is coming soon. Your balance here updates
        automatically.
      </Notice>

      <Pressable
        onPress={() => setReferral(true)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.referral, pressed && { opacity: 0.85 }]}
      >
        <Icon name="gift" size={20} color={colors.emeraldBright} />
        <Text style={[type(15, "semibold"), { flex: 1 }]}>
          Earn {a?.referralPercent ?? 20}% recurring on referrals
        </Text>
        <Icon name="chevronRight" size={16} color={colors.fgMuted} />
      </Pressable>

      <Label>Recent activity</Label>
      {activity.isPending ? (
        <SkeletonCard lines={4} />
      ) : activity.isError ? (
        <EmptyState
          tone="error"
          title="Couldn’t load your activity"
          body={errorMessage(activity.error)}
          action={{ label: "Try again", onPress: () => activity.refetch() }}
        />
      ) : activity.data.length === 0 ? (
        <Text style={[text.caption, { paddingVertical: 8 }]}>
          No activity yet. Credits and minutes you spend or earn show up here.
        </Text>
      ) : (
        <ListGroup>
          {activity.data.map((x, i) => {
            const amount = `${x.delta > 0 ? "+" : "−"}${n(Math.abs(x.delta))}${x.unit === "minutes" ? " min" : ""}`;
            return (
              <ListRow
                key={x.id}
                first={i === 0}
                leading={<IconChip name={ACTIVITY_ICON[x.kind]} />}
                title={x.label}
                subtitle={dayLabel(x.at, now)}
                accessibilityLabel={`${x.label}, ${dayLabel(x.at, now)}, ${x.delta > 0 ? "plus" : "minus"} ${n(Math.abs(x.delta))} ${x.unit}`}
                trailing={
                  <Text
                    style={type(14, "medium", {
                      mono: true,
                      color: x.delta > 0 ? colors.emeraldBright : colors.fg,
                    })}
                  >
                    {amount}
                  </Text>
                }
              />
            );
          })}
        </ListGroup>
      )}
      <ReferralSheet
        visible={referral}
        onClose={() => setReferral(false)}
        percent={a?.referralPercent ?? 20}
      />
    </Page>
  );
}

function BalanceRing({
  icon,
  value,
  max,
  label,
  color,
}: {
  icon: IconName;
  value: number;
  max: number;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.ringTile}>
      <ScoreRing
        value={value}
        max={max}
        size={76}
        color={color}
        icon={icon}
        label={`${n(value)} ${label.toLowerCase()}`}
      />
      <Text style={type(20, "bold", { color: color === colors.emeraldBright ? color : colors.fg })}>
        {n(value)}
      </Text>
      <Text style={type(13, "regular", { color: colors.fgMuted })}>{label}</Text>
    </View>
  );
}

// ── Subscription (design/screens/BN-Subscription) ─────────────────────────

type Term = "monthly" | "yearly";

export function SubscriptionScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const account = useAccount();
  const a = account.data;
  const [chosen, setChosen] = useState<Term | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const term: Term = chosen ?? a?.plan.term ?? "monthly";

  const setCancel = async (cancel: boolean) => {
    setBusy(true);
    try {
      await setCancelAtPeriodEnd(cancel);
      await qc.invalidateQueries({ queryKey: youKeys.account });
      setCancelling(false);
      toast(
        cancel
          ? "Cancelled. Your plan stays active until it ends."
          : "Your plan will renew as usual.",
        "success"
      );
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const paid = !!a && a.plan.tier !== "free";
  const ends = a?.plan.renewsAt ? longDate(a.plan.renewsAt) : null;

  return (
    <Page title="Subscription" onRefresh={() => account.refetch()}>
      {account.isPending ? (
        <SkeletonCard lines={2} />
      ) : account.isError || !a ? (
        <EmptyState
          tone="error"
          title="Couldn’t load your plan"
          body={errorMessage(account.error)}
          action={{ label: "Try again", onPress: () => account.refetch() }}
        />
      ) : (
        <View style={styles.current} accessible>
          <Text style={type(12, "regular", { color: colors.fgMuted })}>Your plan</Text>
          <Text style={type(20, "bold")}>
            {[planName(a), termName(a)].filter(Boolean).join(" · ")}
          </Text>
          <Text
            style={type(12, "regular", {
              color: a.plan.cancelAtPeriodEnd ? colors.warning : colors.fgMuted,
            })}
          >
            {!paid
              ? "Free forever · upgrade any time"
              : a.plan.cancelAtPeriodEnd
                ? `Ends on ${ends} · then you move to Free`
                : `Renews on ${ends}`}
          </Text>
        </View>
      )}

      <SegmentedControl
        accessibilityLabel="Billing period"
        options={[
          { value: "monthly", label: "Monthly" },
          { value: "yearly", label: `Yearly −${YEARLY_DISCOUNT_PCT}%` },
        ]}
        value={term}
        onChange={setChosen}
      />
      <Text style={text.caption}>
        {term === "monthly"
          ? `Monthly prices shown · yearly saves ${YEARLY_DISCOUNT_PCT}%`
          : "Yearly prices shown per month · billed once a year"}
      </Text>

      {PLANS.map((p) => {
        const current = a?.plan.tier === p.tier;
        const popular = p.tier === POPULAR_TIER && !current;
        const storage = p.storageGb < 1 ? `${p.storageGb * 1000} MB` : `${p.storageGb} GB`;
        const bullets = [
          `${n(p.minutes)} Clip Minutes + ${n(p.credits)} credits / mo`,
          ...p.perks,
          `${storage} storage · ${p.uploadHours < 1 ? `${p.uploadHours * 60}-minute` : `${p.uploadHours}-hour`} uploads`,
        ];
        return (
          <View
            key={p.tier}
            style={[styles.plan, current && styles.planOn]}
            accessible
            accessibilityLabel={`${p.name}${current ? ", current plan" : popular ? ", most popular" : ""}. ${usd(perMonthCents(p, term))} a month. ${bullets.join(". ")}`}
          >
            <View style={styles.planHead}>
              <Text style={type(18, "bold")}>{p.name}</Text>
              {current ? (
                <StatusBadge label="Current plan" tone="success" />
              ) : popular ? (
                <StatusBadge label="Most popular" tone="info" />
              ) : null}
            </View>
            <View style={styles.price}>
              <Text style={type(30, "heavy")}>{usd(perMonthCents(p, term))}</Text>
              <Text style={type(13, "regular", { color: colors.fgMuted })}>/mo</Text>
              <Text style={[type(12, "regular", { color: colors.fgSubtle }), { flexShrink: 1 }]}>
                {p.tagline}
              </Text>
            </View>
            {term === "yearly" && p.yearlyCents ? (
              <Text style={type(12, "regular", { color: colors.fgMuted })}>
                Billed {usd(p.yearlyCents)} a year
              </Text>
            ) : null}
            <View style={{ gap: 6 }}>
              {bullets.map((b) => (
                <View key={b} style={styles.bullet}>
                  <Icon name="check" size={14} color={colors.emeraldBright} strokeWidth={2.4} />
                  <Text style={[type(13, "regular"), { flex: 1 }]}>{b}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}

      <Notice>
        Changing plans in the app is coming soon. Your current plan and renewal are shown above.
      </Notice>
      <Text style={[text.caption, { textAlign: "center" }]}>
        Cancel anytime · {MONEY_BACK_DAYS}-day money-back guarantee · commercial license on every
        plan
      </Text>

      {paid && a ? (
        a.plan.cancelAtPeriodEnd ? (
          <Pressable
            onPress={() => setCancel(false)}
            disabled={busy}
            accessibilityRole="button"
            style={styles.textButton}
          >
            <Text style={type(14, "semibold", { color: colors.emeraldBright })}>Keep my plan</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => setCancelling(true)}
            accessibilityRole="button"
            style={styles.textButton}
          >
            <Text style={type(14, "semibold", { color: colors.error })}>Cancel subscription</Text>
          </Pressable>
        )
      ) : null}

      <ConfirmSheet
        visible={cancelling}
        title={`Cancel your ${a ? planName(a) : ""} plan?`}
        body={`It stays active until ${ends ?? "the end of this period"}, then you move to Free. Unused subscription credits expire then; pack credits stay.`}
        confirmLabel="Cancel subscription"
        busy={busy}
        onClose={() => setCancelling(false)}
        onConfirm={() => setCancel(true)}
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  ringTile: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 20,
    paddingHorizontal: 12,
    borderRadius: radius.card,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pack: {
    flexBasis: "47%",
    flexGrow: 1,
    gap: 4,
    padding: 16,
    borderRadius: radius.card,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  packHead: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  minutePack: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: radius.tile,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  referral: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: radius.tile,
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.tintBorder,
  },
  current: {
    gap: 4,
    padding: 16,
    borderRadius: radius.card,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  plan: {
    gap: 10,
    padding: 18,
    borderRadius: radius.card,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  planOn: { backgroundColor: colors.tint, borderColor: colors.emeraldBright, borderWidth: 1.5 },
  planHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  price: { flexDirection: "row", alignItems: "baseline", gap: 6, flexWrap: "wrap" },
  bullet: { flexDirection: "row", alignItems: "center", gap: 8 },
  textButton: { minHeight: 48, alignItems: "center", justifyContent: "center" },
});
