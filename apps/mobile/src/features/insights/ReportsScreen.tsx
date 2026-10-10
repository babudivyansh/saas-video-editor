import {
  PROVIDER_LABEL,
  REPORT_FORMATS,
  REPORT_SECTIONS,
  SHARE_LINK_DEFAULT_DAYS,
  SHARE_LINK_MAX_DAYS,
  formatBytes,
  reportRequest,
  type ReportFile,
  type ReportFormat,
  type ReportSchedule,
  type ReportSection,
  type SavedReport,
} from "@clipiro/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { BottomSheet, Button, Checkbox, Chip, ConfirmSheet, EmptyState, Icon, SectionHeader, SegmentedControl, SkeletonCard, Stepper, StatusBadge, TextField, useToast } from "@/components";
import { social } from "@/lib/api";
import { apiErrorMessage as errorMessage } from "@/lib/errors";
import { colors, radius, text, type } from "@/theme";
import { AnalyticsShell } from "./AnalyticsShell";
import { analyticsKeys } from "./analytics";
import { shareReport } from "./files";
import { useSocialAccounts } from "./queries";

const SCHEDULES = [
  { value: "none", label: "Manual" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// design/screens/BN-SocialReports.html — saved reports, recent files, share links.
export function ReportsScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const accounts = useSocialAccounts();
  const q = useQuery({
    queryKey: analyticsKeys.reports,
    queryFn: social.reports,
    // A file being made: look again until it's ready.
    refetchInterval: (query) => (query.state.data?.files.some((f) => f.status === "running") ? 5000 : false),
  });
  const [sheet, setSheet] = useState<"report" | "link" | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  // New report form.
  const [name, setName] = useState("");
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [sections, setSections] = useState<ReportSection[]>(["kpis", "trends"]);
  const [format, setFormat] = useState<ReportFormat>("pdf");
  const [schedule, setSchedule] = useState<ReportSchedule>("none");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // New link form: which accounts it shows, and for how long.
  const [linkAccounts, setLinkAccounts] = useState<string[]>([]);
  const [days, setDays] = useState<number>(SHARE_LINK_DEFAULT_DAYS);
  const [downloading, setDownloading] = useState<string | null>(null);

  const openReport = () => {
    setName("");
    setAccountIds((accounts.data ?? []).map((a) => a.id));
    setErrors({});
    setSheet("report");
  };
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const save = async () => {
    const parsed = reportRequest.safeParse({ name, accountIds, sections, format, schedule });
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const i of parsed.error.issues) e[String(i.path[0])] ??= i.message;
      return setErrors(e);
    }
    setBusy(true);
    try {
      await social.createReport(parsed.data);
      await qc.invalidateQueries({ queryKey: analyticsKeys.reports });
      setSheet(null);
      toast(schedule === "none" ? "Report is being generated." : `Saved. It’ll be emailed ${schedule}, starting now.`, "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const openLink = () => {
    setLinkAccounts((accounts.data ?? []).map((a) => a.id));
    setSheet("link");
  };
  const newLink = async () => {
    if (!linkAccounts.length) return toast("Pick at least one account.", "info");
    setBusy(true);
    try {
      const { url } = await social.createShareLink({ accountIds: linkAccounts, days });
      await qc.invalidateQueries({ queryKey: analyticsKeys.reports });
      setSheet(null);
      toast("Link created. It’s read-only and can be revoked any time.", "success");
      // The link is only shown now: hand it straight to the share sheet.
      await Share.share({ message: url });
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const download = async (id: string) => {
    setDownloading(id);
    try {
      await shareReport(id);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setDownloading(null);
    }
  };
  const revoke = async (id: string) => {
    try {
      await social.revokeShareLink(id);
      await qc.invalidateQueries({ queryKey: analyticsKeys.reports });
      toast("Link revoked.", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setRevoking(null);
    }
  };

  const accountLabel = (r: SavedReport) =>
    r.accountIds.length === (accounts.data?.length ?? 0)
      ? "All accounts"
      : r.accountIds.map((id) => PROVIDER_LABEL[accounts.data?.find((a) => a.id === id)?.provider ?? "youtube"]).join(", ");

  return (
    <AnalyticsShell tab="reports" onRefresh={() => q.refetch()}>
      <Button label="New report" icon="plus" iconPosition="start" onPress={openReport} fullWidth />
      {q.isPending ? (
        <SkeletonCard lines={4} />
      ) : q.isError ? (
        <EmptyState tone="error" title="Couldn’t load reports" body={errorMessage(q.error)} action={{ label: "Try again", onPress: () => q.refetch() }} />
      ) : (
        <>
          <Text style={text.label} accessibilityRole="header">
            Saved reports
          </Text>
          {q.data.saved.length ? (
            <View style={styles.list}>
              {q.data.saved.map((r, i) => (
                <View key={r.id} style={[styles.row, i > 0 && styles.divider]} accessible accessibilityLabel={`${r.name}, ${r.format.toUpperCase()}, ${r.schedule === "none" ? "manual" : r.schedule}`}>
                  <FileBadge format={r.format} />
                  <View style={{ flex: 1 }}>
                    <Text style={type(14, "semibold")}>{r.name}</Text>
                    <Text style={type(12, "regular", { color: colors.fgMuted })} numberOfLines={1}>
                      {accountLabel(r)} · {r.sections.map((s) => REPORT_SECTIONS.find((x) => x.id === s)?.label).join(", ")}
                    </Text>
                  </View>
                  <StatusBadge label={r.schedule === "none" ? "Manual" : r.schedule === "weekly" ? "Weekly" : "Monthly"} tone={r.schedule === "none" ? "neutral" : "info"} dot={false} />
                </View>
              ))}
            </View>
          ) : (
            <Text style={text.caption}>No saved reports yet.</Text>
          )}

          <Text style={text.label} accessibilityRole="header">
            Recent files
          </Text>
          {q.data.files.length ? (
            <View style={styles.list}>
              {q.data.files.map((f, i) => (
                <FileRow key={f.id} f={f} first={i === 0} busy={downloading === f.id} onDownload={() => void download(f.id)} />
              ))}
            </View>
          ) : (
            <Text style={text.caption}>Reports you generate show up here.</Text>
          )}

          <SectionHeader title="Share links" action={{ label: "New link", onPress: openLink }} />
          {q.data.links.length ? (
            <View style={styles.list}>
              {q.data.links.map((l, i) => (
                <View key={l.id} style={[styles.row, i > 0 && styles.divider]}>
                  <View style={styles.linkIcon}>
                    <Icon name="link" size={16} color={colors.emeraldBright} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={type(14, "semibold")}>{l.name}</Text>
                    <Text style={type(12, "regular", { color: colors.fgMuted })}>
                      Viewed {l.views} times · expires {day(l.expiresAt)}
                    </Text>
                  </View>
                  <Pressable onPress={() => setRevoking(l.id)} accessibilityRole="button" accessibilityLabel={`Revoke ${l.name}`} style={styles.revoke}>
                    <Text style={type(13, "semibold", { color: colors.error })}>Revoke</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <Text style={text.caption}>No active links.</Text>
          )}
          <Text style={text.caption}>Scheduled reports are emailed to you. Share links are read-only and can be revoked any time.</Text>
        </>
      )}

      <BottomSheet visible={sheet === "report"} onClose={() => setSheet(null)} title="New report">
        <TextField label="Name" value={name} onChangeText={setName} placeholder="Monthly performance" maxLength={120} error={errors.name} />
        <Text style={text.label}>Accounts</Text>
        <View style={styles.chips}>
          {(accounts.data ?? []).map((a) => (
            <Chip key={a.id} label={PROVIDER_LABEL[a.provider]} selected={accountIds.includes(a.id)} onPress={() => setAccountIds((l) => toggle(l, a.id))} />
          ))}
        </View>
        {errors.accountIds ? <Text style={type(12, "regular", { color: colors.error })}>{errors.accountIds}</Text> : null}
        <Text style={text.label}>Sections</Text>
        <View style={styles.checks}>
          {REPORT_SECTIONS.map((sct) => (
            <Checkbox key={sct.id} checked={sections.includes(sct.id)} onChange={() => setSections((l) => toggle(l, sct.id))} label={sct.label} accessibilityLabel={sct.label} />
          ))}
        </View>
        {errors.sections ? <Text style={type(12, "regular", { color: colors.error })}>{errors.sections}</Text> : null}
        <View style={styles.formRow}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={text.label}>Format</Text>
            <SegmentedControl accessibilityLabel="Format" options={REPORT_FORMATS.map((f) => ({ value: f, label: f.toUpperCase() }))} value={format} onChange={setFormat} />
          </View>
        </View>
        <Text style={text.label}>Schedule</Text>
        <SegmentedControl accessibilityLabel="Schedule" options={SCHEDULES} value={schedule} onChange={setSchedule} />
        <Button label={schedule === "none" ? "Generate report" : "Save and schedule"} variant="secondary" size="sm" fullWidth loading={busy} onPress={save} />
      </BottomSheet>

      <BottomSheet visible={sheet === "link"} onClose={() => setSheet(null)} title="New share link">
        <Text style={text.label}>Accounts</Text>
        <View style={styles.chips}>
          {(accounts.data ?? []).map((a) => (
            <Chip key={a.id} label={PROVIDER_LABEL[a.provider]} selected={linkAccounts.includes(a.id)} onPress={() => setLinkAccounts((l) => toggle(l, a.id))} />
          ))}
        </View>
        <Text style={text.label}>Expires after</Text>
        <Stepper size="md" label="Days" value={days} min={1} max={SHARE_LINK_MAX_DAYS} onChange={setDays} format={(v) => `${v} day${v === 1 ? "" : "s"}`} />
        <Text style={text.caption}>Anyone with the link sees a read-only view of these accounts’ KPIs, trends and top content until it expires or you revoke it.</Text>
        <Button label="Create link" variant="secondary" size="sm" fullWidth loading={busy} onPress={newLink} />
      </BottomSheet>

      <ConfirmSheet visible={!!revoking} title="Revoke this link?" body="Anyone using it loses access straight away." confirmLabel="Revoke link" onClose={() => setRevoking(null)} onConfirm={() => revoking && revoke(revoking)} />
    </AnalyticsShell>
  );
}

function FileBadge({ format }: { format: ReportFormat }) {
  return (
    <View style={styles.fileBadge}>
      <Text style={type(10, "bold", { color: colors.emeraldBright })}>{format.toUpperCase()}</Text>
    </View>
  );
}

function FileRow({ f, first, busy, onDownload }: { f: ReportFile; first: boolean; busy: boolean; onDownload: () => void }) {
  return (
    <View style={[styles.row, !first && styles.divider]}>
      <FileBadge format={f.format} />
      <View style={{ flex: 1 }}>
        <Text style={type(14, "semibold")} numberOfLines={2}>
          {f.title}
        </Text>
        <Text style={type(12, "regular", { color: colors.fgMuted })}>
          {f.status === "running" ? "Generating…" : f.status === "failed" ? "Failed. Try generating it again." : `Ready · ${formatBytes(f.sizeBytes ?? 0)} · ${day(f.createdAt)}`}
        </Text>
      </View>
      {f.status === "ready" ? (
        <Pressable onPress={onDownload} disabled={busy} accessibilityRole="button" accessibilityLabel={`Download ${f.title}`} aria-busy={busy} style={[styles.download, busy && { opacity: 0.5 }]}>
          <Icon name="download" size={18} color={colors.fg} />
        </Pressable>
      ) : f.status === "running" ? (
        <StatusBadge label="Running" tone="warning" />
      ) : (
        <StatusBadge label="Failed" tone="error" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 14, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, minHeight: 60 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  fileBadge: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.tintBorder, alignItems: "center", justifyContent: "center" },
  download: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center" },
  linkIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.surface1, alignItems: "center", justifyContent: "center" },
  revoke: { minHeight: 44, justifyContent: "center", paddingHorizontal: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  checks: { gap: 4 },
  formRow: { flexDirection: "row", gap: 12 },
});
