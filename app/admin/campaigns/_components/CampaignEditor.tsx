"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/app/components/ui/Field";
import { Button } from "@/app/components/ui/Button";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { useToast } from "@/app/components/ui/Toast";
import { BlockEditor } from "./BlockEditor";
import { EmailPreview } from "./EmailPreview";
import { AudiencePicker } from "./AudiencePicker";
import { CampaignReport } from "./CampaignReport";
import { useCampaignApi } from "./useCampaignApi";
import { STATUS_LABEL, STATUS_TONE, fmtDateTime, type Campaign, type CampaignDraft } from "./types";

/** A datetime-local value (browser time zone) a few minutes from now. */
function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TZ = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "local time";

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-panel p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-bold text-fg">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function CampaignEditor({ initial, campaign }: { initial: CampaignDraft; campaign?: Campaign }) {
  const api = useCampaignApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [draft, setDraft] = useState<CampaignDraft>(initial);
  const [saved, setSaved] = useState<string>(JSON.stringify(initial));
  const [busy, setBusy] = useState<string | null>(null);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduleAt, setScheduleAt] = useState(() => localInputValue(new Date(Date.now() + 60 * 60_000)));
  const [confirm, setConfirm] = useState<null | "cancel" | "delete">(null);

  const status = campaign?.status ?? "draft";
  const editable = status === "draft";
  const dirty = JSON.stringify(draft) !== saved;
  const patch = (p: Partial<CampaignDraft>) => setDraft((d) => ({ ...d, ...p }));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-campaigns"] });
    if (campaign) queryClient.invalidateQueries({ queryKey: ["admin-campaign", campaign.id] });
  };

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label);
    try {
      return await fn();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Something went wrong", "error");
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  /** Save, returning the campaign id (creating it on first save). */
  async function save(): Promise<string | undefined> {
    if (!campaign) {
      const r = await api<{ campaign: Campaign }>("", { body: draft });
      setSaved(JSON.stringify(draft));
      refresh();
      router.replace(`/admin/campaigns/${r.campaign.id}`);
      return r.campaign.id;
    }
    if (dirty) {
      await api(`/${campaign.id}`, { method: "PATCH", body: draft });
      setSaved(JSON.stringify(draft));
      refresh();
    }
    return campaign.id;
  }

  const onSave = () => run("save", async () => { await save(); showToast("Saved", "success"); });

  const onTest = () =>
    run("test", async () => {
      const id = await save();
      if (!id) return;
      const r = await api<{ message: string }>(`/${id}/test`, { method: "POST", body: {} });
      showToast(r.message, "success");
    });

  const action = (name: "unschedule" | "pause" | "resume" | "cancel", extra: Record<string, unknown> = {}) =>
    run(name, async () => {
      if (!campaign) return;
      await api(`/${campaign.id}/action`, { body: { action: name, ...extra } });
      refresh();
      showToast(`Campaign ${name === "unschedule" ? "back to draft" : name === "cancel" ? "cancelled" : `${name}d`}`, "success");
    });

  const onSchedule = async () => {
    await run("schedule", async () => {
      const id = await save();
      if (!id) return;
      const at = scheduleMode === "now" ? new Date() : new Date(scheduleAt);
      if (Number.isNaN(at.getTime())) throw new Error("Pick a valid date and time.");
      await api(`/${id}/action`, { body: { action: "schedule", scheduledAt: at.toISOString() } });
      refresh();
      showToast(scheduleMode === "now" ? "Sending starts within 2 minutes" : `Scheduled for ${fmtDateTime(at.toISOString())}`, "success");
    });
    setScheduleOpen(false);
  };

  const onDelete = () =>
    run("delete", async () => {
      if (!campaign) return;
      await api(`/${campaign.id}`, { method: "DELETE" });
      refresh();
      router.push("/admin/campaigns");
    });

  return (
    <div className="space-y-5">
      {/* Header: status + the actions this status allows. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusBadge>
          {campaign?.scheduledAt && status === "scheduled" && (
            <span className="text-xs text-fg-muted">Starts {fmtDateTime(campaign.scheduledAt)}</span>
          )}
          {dirty && editable && <span className="text-xs text-warning">Unsaved changes</span>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {editable && (
            <>
              <Button variant="secondary" size="sm" onClick={onTest} loading={busy === "test"} disabled={!!busy}>Send test to me</Button>
              <Button variant="secondary" size="sm" onClick={onSave} loading={busy === "save"} disabled={!!busy || (!dirty && !!campaign)}>
                {campaign ? "Save" : "Save draft"}
              </Button>
              <Button variant="primary" size="sm" onClick={() => setScheduleOpen(true)} disabled={!!busy}>Schedule…</Button>
              {campaign && <Button variant="danger" size="sm" onClick={() => setConfirm("delete")} disabled={!!busy}>Delete</Button>}
            </>
          )}
          {status === "scheduled" && (
            <>
              <Button variant="secondary" size="sm" onClick={() => action("unschedule")} loading={busy === "unschedule"} disabled={!!busy}>Unschedule to edit</Button>
              <Button variant="danger" size="sm" onClick={() => setConfirm("cancel")} disabled={!!busy}>Cancel</Button>
            </>
          )}
          {status === "sending" && (
            <>
              <Button variant="secondary" size="sm" onClick={() => action("pause")} loading={busy === "pause"} disabled={!!busy}>Pause</Button>
              <Button variant="danger" size="sm" onClick={() => setConfirm("cancel")} disabled={!!busy}>Cancel</Button>
            </>
          )}
          {status === "paused" && (
            <>
              <Button variant="primary" size="sm" onClick={() => action("resume")} loading={busy === "resume"} disabled={!!busy}>Resume</Button>
              <Button variant="danger" size="sm" onClick={() => setConfirm("cancel")} disabled={!!busy}>Cancel</Button>
            </>
          )}
          {status === "cancelled" && campaign?.sentCount === 0 && (
            <Button variant="danger" size="sm" onClick={() => setConfirm("delete")} disabled={!!busy}>Delete</Button>
          )}
        </div>
      </div>

      {campaign && status !== "draft" && status !== "scheduled" && <CampaignReport campaignId={campaign.id} />}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,680px)] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <Section title="Details">
            <div className="grid grid-cols-1 gap-3">
              <label className="block">
                <span className="text-xs font-semibold text-fg-subtle block mb-1">Campaign name (internal; also the utm_campaign tag)</span>
                <Input disabled={!editable} value={draft.name} maxLength={120} placeholder="Black Friday 2026" onChange={(e) => patch({ name: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-fg-subtle block mb-1">Subject line</span>
                <Input disabled={!editable} value={draft.subject} maxLength={150} placeholder="Black Friday: 2x Clip Minutes is live" onChange={(e) => patch({ subject: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-fg-subtle block mb-1">Preview text (shown after the subject in the inbox)</span>
                <Input disabled={!editable} value={draft.preheader} maxLength={200} onChange={(e) => patch({ preheader: e.target.value })} />
              </label>
            </div>
          </Section>

          <Section title="Audience">
            <AudiencePicker audience={draft.audience} onChange={(audience) => patch({ audience })} disabled={!editable} onCount={setAudienceCount} />
          </Section>

          <Section title="Content" aside={<span className="text-[11px] text-fg-subtle">Links to clipiro.com get UTM tags automatically</span>}>
            <BlockEditor blocks={draft.blocks} onChange={(blocks) => patch({ blocks })} disabled={!editable} />
          </Section>
        </div>

        <div className="xl:sticky xl:top-4 min-w-0">
          <EmailPreview subject={draft.subject} preheader={draft.preheader} blocks={draft.blocks} />
        </div>
      </div>

      <ConfirmDialog
        open={scheduleOpen}
        title="Schedule this campaign"
        confirmLabel={scheduleMode === "now" ? "Start sending" : "Schedule"}
        message={`It goes to ${audienceCount == null ? "the selected audience" : `about ${audienceCount.toLocaleString("en-IN")} people`} in batches, within today's campaign budget, so a large audience can take more than a day. You can pause or cancel at any time.`}
        onConfirm={onSchedule}
        onClose={() => setScheduleOpen(false)}
      >
        <div className="space-y-2 mt-3">
          <label className="flex items-center gap-2 text-sm text-fg">
            <input type="radio" name="when" checked={scheduleMode === "now"} onChange={() => setScheduleMode("now")} /> Now
          </label>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input type="radio" name="when" checked={scheduleMode === "later"} onChange={() => setScheduleMode("later")} /> Later
          </label>
          {scheduleMode === "later" && (
            <div>
              <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
              <p className="text-[11px] text-fg-subtle mt-1">Your time zone ({TZ}).</p>
            </div>
          )}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === "cancel"}
        title="Cancel this campaign?"
        danger
        confirmLabel="Cancel campaign"
        message="Nobody else gets it. People it already reached are unaffected. This can't be undone."
        onConfirm={() => action("cancel")}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        title="Delete this campaign?"
        danger
        confirmLabel="Delete"
        message={`"${draft.name || "Untitled"}" will be removed. This can't be undone.`}
        onConfirm={onDelete}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
