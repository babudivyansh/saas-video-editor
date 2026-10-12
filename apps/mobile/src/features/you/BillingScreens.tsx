import { PLANS, ROLLOVER_MULTIPLIER, type Activity, type Invoice } from "@clipiro/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button, ConfirmSheet, EmptyState, Icon, ListGroup, ListRow, ScoreRing, SkeletonCard, StatusBadge, useToast, type IconName } from "@/components";
import { API_URL, me, tokenStore } from "@/lib/api";
import { apiErrorMessage as errorMessage } from "@/lib/errors";
import { colors, radius, text, type } from "@/theme";
import { IconChip, Label, Page, ReferralSheet } from "./bits";
import { planName, termName } from "./ProfileScreen";
import { dayLabel, longDate, useAccount, useActivity, youKeys } from "./queries";

// Read-only billing (docs/mobile/BILLING.md, B1–B3 A): balances, usage, the
// plan bought on the web, cancel / resume and invoices. Google Play's policy
// doesn't let the app sell or point to the website to buy, so there are no
// prices, packs or "upgrade" buttons here.

const n = (v: number) => v.toLocaleString("en-US");
const money = (minor: number, currency: string) => {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
};

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
        <EmptyState tone="error" title="Couldn’t load your balance" body={errorMessage(account.error)} action={{ label: "Try again", onPress: () => account.refetch() }} />
      ) : (
        <View style={styles.row}>
          <BalanceRing icon="clock" value={a.clipMinutes.remaining} max={Math.max(a.clipMinutes.allowance, a.clipMinutes.remaining)} label="Clip minutes" color={colors.emeraldBright} />
          <BalanceRing icon="bolt" value={a.aiCredits.remaining} max={Math.max(a.aiCredits.allowance * ROLLOVER_MULTIPLIER, a.aiCredits.remaining) || 1} label="AI credits" color={colors.info} />
        </View>
      )}
      <Text style={text.caption}>
        {a?.plan.tier === "free"
          ? "Your monthly allowance refills each month."
          : `Plan minutes and credits refill each month${a?.plan.renewsAt ? `, next on ${longDate(a.plan.renewsAt)}` : ""}. Unused credits roll over up to ${ROLLOVER_MULTIPLIER}× your allowance; pack credits never expire.`}
      </Text>

      <Pressable onPress={() => setReferral(true)} accessibilityRole="button" style={({ pressed }) => [styles.referral, pressed && { opacity: 0.85 }]}>
        <Icon name="gift" size={20} color={colors.emeraldBright} />
        <Text style={[type(15, "semibold"), { flex: 1 }]}>Earn {a?.referralPercent ?? 20}% recurring on referrals</Text>
        <Icon name="chevronRight" size={16} color={colors.fgMuted} />
      </Pressable>

      <Label>Recent activity</Label>
      {activity.isPending ? (
        <SkeletonCard lines={4} />
      ) : activity.isError ? (
        <EmptyState tone="error" title="Couldn’t load your activity" body={errorMessage(activity.error)} action={{ label: "Try again", onPress: () => activity.refetch() }} />
      ) : activity.data.length === 0 ? (
        <Text style={[text.caption, { paddingVertical: 8 }]}>No activity yet. Credits and minutes you spend or earn show up here.</Text>
      ) : (
        <>
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
                  trailing={<Text style={type(14, "medium", { mono: true, color: x.delta > 0 ? colors.emeraldBright : colors.fg })}>{amount}</Text>}
                />
              );
            })}
          </ListGroup>
          {activity.hasNextPage ? (
            <Button label="Show older" variant="secondary" size="sm" fullWidth loading={activity.isFetchingNextPage} onPress={() => void activity.fetchNextPage()} />
          ) : null}
        </>
      )}
      <ReferralSheet visible={referral} onClose={() => setReferral(false)} percent={a?.referralPercent ?? 20} />
    </Page>
  );
}

function BalanceRing({ icon, value, max, label, color }: { icon: IconName; value: number; max: number; label: string; color: string }) {
  return (
    <View style={styles.ringTile}>
      <ScoreRing value={value} max={max} size={76} color={color} icon={icon} label={`${n(value)} ${label.toLowerCase()}`} />
      <Text style={type(20, "bold", { color: color === colors.emeraldBright ? color : colors.fg })}>{n(value)}</Text>
      <Text style={type(13, "regular", { color: colors.fgMuted })}>{label}</Text>
    </View>
  );
}

// ── Subscription (design/screens/BN-Subscription) ─────────────────────────

const INVOICE_STATUS: Record<Invoice["status"], { label: string; tone: "success" | "warning" | "error" | "neutral" }> = {
  paid: { label: "Paid", tone: "success" },
  refunded: { label: "Refunded", tone: "neutral" },
  failed: { label: "Failed", tone: "error" },
  pending: { label: "Pending", tone: "warning" },
};

/** Downloads an invoice PDF with this session's token, then opens the share sheet. */
async function shareInvoice(id: string) {
  // Through the API client first: it checks the purchase is ours and refreshes an expired token.
  const { fileName } = await me.invoice(id);
  if (!fileName) throw new Error("There’s no invoice for this purchase.");
  const tokens = await tokenStore.get();
  const file = new File(Paths.cache, fileName);
  await File.downloadFileAsync(`${API_URL}/api/mobile/v1/billing/invoices/${encodeURIComponent(id)}/pdf`, file, {
    headers: tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
    idempotent: true,
  });
  await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: fileName });
}

export function SubscriptionScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const account = useAccount();
  const invoices = useQuery({ queryKey: [...youKeys.account, "invoices"], queryFn: () => me.invoices().then((r) => r.invoices) });
  const a = account.data;
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);

  const setCancel = async (cancel: boolean) => {
    setBusy(true);
    try {
      await (cancel ? me.cancelSubscription() : me.resumeSubscription());
      await qc.invalidateQueries({ queryKey: youKeys.account });
      setCancelling(false);
      toast(cancel ? "Cancelled. Your plan stays active until it ends." : "Your plan will renew as usual.", "success");
    } catch (e) {
      setCancelling(false);
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const share = async (inv: Invoice) => {
    setSharing(inv.id);
    try {
      await shareInvoice(inv.id);
    } catch (e) {
      toast(e instanceof Error && !("status" in e) ? e.message : errorMessage(e), "error");
    } finally {
      setSharing(null);
    }
  };

  const paid = !!a && a.plan.tier !== "free";
  const ends = a?.plan.renewsAt ? longDate(a.plan.renewsAt) : null;
  const plan = PLANS.find((p) => p.tier === a?.plan.tier);
  const storage = plan ? (plan.storageGb < 1 ? `${plan.storageGb * 1000} MB` : `${plan.storageGb} GB`) : null;
  const includes = plan
    ? [
        `${n(plan.minutes)} Clip Minutes and ${n(plan.credits)} AI credits a month`,
        ...plan.perks,
        `${storage} storage · ${plan.uploadHours < 1 ? `${plan.uploadHours * 60}-minute` : `${plan.uploadHours}-hour`} uploads`,
      ]
    : [];

  return (
    <Page title="Subscription" onRefresh={() => Promise.all([account.refetch(), invoices.refetch()])}>
      {account.isPending ? (
        <SkeletonCard lines={2} />
      ) : account.isError || !a ? (
        <EmptyState tone="error" title="Couldn’t load your plan" body={errorMessage(account.error)} action={{ label: "Try again", onPress: () => account.refetch() }} />
      ) : (
        <>
          <View style={styles.current} accessible>
            <Text style={type(12, "regular", { color: colors.fgMuted })}>Your plan</Text>
            <Text style={type(20, "bold")}>{[planName(a), termName(a)].filter(Boolean).join(" · ")}</Text>
            <Text style={type(12, "regular", { color: a.plan.cancelAtPeriodEnd ? colors.warning : colors.fgMuted })}>
              {!paid ? "Free plan" : a.plan.cancelAtPeriodEnd ? `Ends on ${ends} · then you move to Free` : `Renews on ${ends}`}
            </Text>
          </View>
          {includes.length ? (
            <View style={styles.plan}>
              <Text style={type(15, "bold")}>What’s included</Text>
              <View style={{ gap: 6 }}>
                {includes.map((b) => (
                  <View key={b} style={styles.bullet}>
                    <Icon name="check" size={14} color={colors.emeraldBright} strokeWidth={2.4} />
                    <Text style={[type(13, "regular"), { flex: 1 }]}>{b}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}

      {paid && a ? (
        a.plan.cancelAtPeriodEnd ? (
          <Pressable onPress={() => setCancel(false)} disabled={busy} accessibilityRole="button" style={styles.textButton}>
            <Text style={type(14, "semibold", { color: colors.emeraldBright })}>Keep my plan</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setCancelling(true)} accessibilityRole="button" style={styles.textButton}>
            <Text style={type(14, "semibold", { color: colors.error })}>Cancel subscription</Text>
          </Pressable>
        )
      ) : null}

      <Label>Invoices</Label>
      {invoices.isPending ? (
        <SkeletonCard lines={2} />
      ) : invoices.isError ? (
        <EmptyState tone="error" title="Couldn’t load your invoices" body={errorMessage(invoices.error)} action={{ label: "Try again", onPress: () => invoices.refetch() }} />
      ) : invoices.data.length === 0 ? (
        <Text style={[text.caption, { paddingVertical: 8 }]}>No purchases yet.</Text>
      ) : (
        <ListGroup>
          {invoices.data.map((inv, i) => (
            <ListRow
              key={inv.id}
              first={i === 0}
              leading={<IconChip name="file" />}
              title={inv.label}
              subtitle={`${longDate(inv.createdAt)} · ${money(inv.amount, inv.currency)}${inv.invoiceNumber ? ` · ${inv.invoiceNumber}` : ""}`}
              accessibilityLabel={`${inv.label}, ${longDate(inv.createdAt)}, ${money(inv.amount, inv.currency)}, ${INVOICE_STATUS[inv.status].label}${inv.invoiceNumber ? ". Share the invoice" : ""}`}
              onPress={inv.invoiceNumber ? () => void share(inv) : undefined}
              trailing={sharing === inv.id ? <Text style={text.caption}>Opening…</Text> : <StatusBadge label={INVOICE_STATUS[inv.status].label} tone={INVOICE_STATUS[inv.status].tone} />}
            />
          ))}
        </ListGroup>
      )}

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
  current: { gap: 4, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  plan: { gap: 10, padding: 18, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  bullet: { flexDirection: "row", alignItems: "center", gap: 8 },
  textButton: { minHeight: 48, alignItems: "center", justifyContent: "center" },
});
