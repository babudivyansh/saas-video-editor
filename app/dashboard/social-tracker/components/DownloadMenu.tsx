"use client";

// Every way to take data out, in one menu: the CSVs, a PDF or Excel report of
// the period on screen, and a read-only share link. It replaces the Reports
// tab's three blocks and the Overview's separate "Export CSV" (which only ever
// exported the first account).
//
// Reports are built in the background, so picking one queues a run, follows it
// and starts the download when it lands. Leaving the page doesn't lose it: the
// run is listed under Settings → Reports, and emailed links point there.

import { useCallback, useEffect, useRef, useState } from "react";
import { Dropdown } from "@/app/components/ui/Dropdown";
import { Modal } from "@/app/components/ui/Modal";
import { Button } from "@/app/components/ui/Button";
import { useToast } from "@/app/components/ui/Toast";
import { downloadFile } from "@/lib/download-file";
import { SocialApiError, useSocialApi, useSocialDownload } from "./useSocialApi";

const CSVS = [
  { kind: "posts", label: "Posts" },
  { kind: "daily", label: "Daily metrics" },
  { kind: "snapshots", label: "Follower history" },
  { kind: "audience", label: "Audience" },
] as const;

const POLL_MS = 2_000;
const POLL_TIMEOUT_MS = 3 * 60_000;

/** The report period that matches the range on screen. */
function periodFor(range: number): "weekly" | "monthly" | "quarterly" | "annual" {
  if (range >= 365) return "annual";
  if (range >= 90) return "quarterly";
  if (range >= 30) return "monthly";
  return "weekly";
}

export function DownloadMenu({ accounts, range }: { accounts: Array<{ id: string; label: string }>; range: number }) {
  const api = useSocialApi();
  const download = useSocialDownload();
  const { showToast } = useToast();
  const [csvAccount, setCsvAccount] = useState(accounts[0]?.id ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The account in view can change under the menu (the header switcher).
  const accountId = accounts.some((a) => a.id === csvAccount) ? csvAccount : (accounts[0]?.id ?? "");

  const csv = useCallback(
    async (kind: string) => {
      setBusy(kind);
      try {
        await download(`/api/social/export?accountId=${encodeURIComponent(accountId)}&kind=${kind}`, `${kind}.csv`);
      } catch (e) {
        showToast(
          e instanceof SocialApiError && e.status === 429
            ? "Too many downloads just now. Try again in a few minutes."
            : "Couldn't download that file.",
          "error",
        );
      } finally {
        setBusy(null);
      }
    },
    [accountId, download, showToast],
  );

  const report = useCallback(
    async (format: "pdf" | "xlsx") => {
      setBusy(format);
      try {
        const period = periodFor(range);
        const { run } = await api<{ run: { id: string } }>("/api/social/reports", {
          method: "POST",
          body: JSON.stringify({
            config: {
              accountIds: accounts.map((a) => a.id),
              period,
              sections: ["kpis", "trends", "content", "ai"],
              format,
              schedule: "none",
              deliverToOwner: false,
            },
            period,
            format,
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });
        showToast("Building your report. It downloads when it's ready.", "info");

        const deadline = Date.now() + POLL_TIMEOUT_MS;
        while (alive.current && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, POLL_MS));
          const data = await api<{ run: { status: string; error: string | null }; downloadUrl?: string | null }>(
            `/api/social/reports/${run.id}`,
          ).catch(() => null);
          if (!data) continue;
          if (data.run.status === "failed") {
            showToast(data.run.error ?? "Couldn't build that report. Try again.", "error");
            return;
          }
          if (data.run.status !== "queued" && data.run.status !== "running") {
            if (data.downloadUrl) downloadFile(data.downloadUrl);
            return;
          }
        }
        if (alive.current) showToast("Still building. Find it under Settings → Reports.", "info");
      } catch (e) {
        showToast(
          e instanceof SocialApiError && e.status === 429
            ? "You've built a lot of reports this hour. Try again later."
            : "Couldn't start the report.",
          "error",
        );
      } finally {
        if (alive.current) setBusy(null);
      }
    },
    [accounts, api, range, showToast],
  );

  const share = useCallback(async () => {
    setBusy("share");
    try {
      const { url } = await api<{ url: string }>("/api/social/report-link", {
        method: "POST",
        body: JSON.stringify({ accountIds: accounts.map((a) => a.id) }),
      });
      try {
        await navigator.clipboard.writeText(url);
        showToast("Share link copied. It works for 7 days.", "success");
      } catch {
        setShareUrl(url);
      }
    } catch {
      showToast("Couldn't create a share link.", "error");
    } finally {
      setBusy(null);
    }
  }, [accounts, api, showToast]);

  const item =
    "flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-sm text-fg hover:bg-surface-3 focus-visible:bg-surface-3 focus-visible:outline-none disabled:opacity-50";

  return (
    <>
      <Dropdown
        align="right"
        className="w-64"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
          >
            {busy === "pdf" || busy === "xlsx" ? "Building report…" : busy ? "Preparing…" : "Download"}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      >
        {({ close }) => (
          <div className="py-1.5">
            <p className="px-3.5 pb-1 pt-1 text-[10px] font-bold uppercase tracking-widest text-fg-subtle">Spreadsheet (CSV)</p>
            {accounts.length > 1 && (
              <div className="px-3.5 pb-1.5">
                <label className="sr-only" htmlFor="download-account">
                  Account for the CSV
                </label>
                <select
                  id="download-account"
                  value={accountId}
                  onChange={(e) => setCsvAccount(e.target.value)}
                  className="w-full rounded-lg border border-line bg-panel px-2 py-1 text-xs text-fg"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {CSVS.map((c) => (
              <button
                key={c.kind}
                type="button"
                role="menuitem"
                className={item}
                onClick={() => {
                  close();
                  void csv(c.kind);
                }}
              >
                {c.label}
                <span className="text-[11px] text-fg-subtle">.csv</span>
              </button>
            ))}

            <div className="my-1.5 border-t border-line" />
            <p className="px-3.5 pb-1 text-[10px] font-bold uppercase tracking-widest text-fg-subtle">Report for this period</p>
            <button type="button" role="menuitem" className={item} onClick={() => { close(); void report("pdf"); }}>
              PDF report<span className="text-[11px] text-fg-subtle">.pdf</span>
            </button>
            <button type="button" role="menuitem" className={item} onClick={() => { close(); void report("xlsx"); }}>
              Excel report<span className="text-[11px] text-fg-subtle">.xlsx</span>
            </button>

            <div className="my-1.5 border-t border-line" />
            <button type="button" role="menuitem" className={item} onClick={() => { close(); void share(); }}>
              Copy share link
              <span className="text-[11px] text-fg-subtle">7 days</span>
            </button>
          </div>
        )}
      </Dropdown>

      <Modal open={shareUrl !== null} onClose={() => setShareUrl(null)} title="Share link">
        <div className="space-y-3">
          <p className="text-sm text-fg-muted">
            Anyone with this link can see these accounts&apos; headline numbers for 7 days. You can turn it off any
            time under Settings.
          </p>
          <input
            readOnly
            value={shareUrl ?? ""}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Share link"
            className="w-full rounded-lg border border-line bg-surface-3 px-3 py-2 text-xs text-fg"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShareUrl(null)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
