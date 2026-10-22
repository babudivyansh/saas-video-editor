"use client";
// Post or download (design C6): what to do with the clips the user kept.
//
// "Post them for me" schedules one clip a day from a time the user picks,
// through the same per-clip publish route the Publish panel uses — YouTube is
// uploaded by the scheduler; other networks become "your turn" posts. There is
// no "best time" data, so the user picks the time. "Download" streams a zip of
// exactly these clips (download-all?ids=).

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Breadcrumbs from "@/app/components/ui/Breadcrumbs";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { ApiError, apiFetch } from "@/app/dashboard/create/auto-clip/_components/shared";
import type { PublishAccount } from "@/app/dashboard/create/auto-clip/_components/ClipActions";
import { ProjectGone } from "./RunStates";
import { useClipsSource } from "./useClipsSource";
import { clipName, isReady, sortClips, type ProjectClipsResponse, type ViewClip } from "./model";
import s from "./review.module.css";

const PROVIDER_LABEL: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook" };
const DAY_MS = 24 * 60 * 60 * 1000;
// Mirrors AUTO_PUBLISH_PROVIDERS in lib/social/publish.ts. Not imported: that
// module pulls Prisma, Redis and nodemailer into the browser bundle.
const AUTO_PUBLISH_PROVIDERS = new Set(["youtube"]);

/** "YYYY-MM-DDTHH:mm" in local time, for <input type="datetime-local">. */
function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function tomorrowAtSix() {
  const d = new Date(Date.now() + DAY_MS);
  d.setHours(18, 0, 0, 0);
  return d;
}

/** The clips this page acts on: ?clips= in that order, else the hearted ones, else every finished clip. */
export function pickShareClips(clips: ViewClip[], idsParam: string | null): ViewClip[] {
  const ready = sortClips(clips.filter(isReady), "score");
  const ids = (idsParam ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (ids.length) {
    const byId = new Map(ready.map((c) => [c.id, c]));
    return ids.map((id) => byId.get(id)).filter((c): c is ViewClip => !!c);
  }
  const kept = ready.filter((c) => c.isFavorite);
  return kept.length ? kept : ready;
}

type Done = { kind: "post"; scheduled: number; failed: number; provider: string; first: Date } | { kind: "download" };

export function SharePanel({ projectId }: { projectId: string }) {
  const params = useSearchParams();
  const { query } = useClipsSource({ kind: "project", id: projectId });
  const data = query.data as ProjectClipsResponse | undefined;
  const clipsParam = params.get("clips");
  const clips = useMemo(() => pickShareClips(data?.clips ?? [], clipsParam), [data, clipsParam]);

  const accountsQuery = useQuery({
    queryKey: ["share-accounts", projectId, clips[0]?.id],
    queryFn: () => apiFetch<{ accounts: PublishAccount[] }>(`/api/projects/${projectId}/clips/${clips[0].id}/publish`),
    enabled: clips.length > 0,
  });
  const accounts = useMemo(() => accountsQuery.data?.accounts ?? [], [accountsQuery.data]);
  const [accountId, setAccountId] = useState("");
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const [startAt, setStartAt] = useState(() => toLocalInput(tomorrowAtSix()));
  // Read once: Date.now() during render is impure.
  const [minStart] = useState(() => toLocalInput(new Date(Date.now() + 5 * 60_000)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  if (query.error instanceof ApiError && query.error.status === 404) return <ProjectGone />;

  const title = data?.project.title ?? "Project";
  const n = clips.length;
  const zipHref = `/api/projects/${projectId}/clips/download-all${n ? `?ids=${clips.map((c) => encodeURIComponent(c.id)).join(",")}` : ""}`;
  const reviewHref = `/dashboard/projects/${projectId}/review`;
  const projectHref = `/dashboard/projects/${projectId}`;
  const autoProvider = account ? AUTO_PUBLISH_PROVIDERS.has(account.provider) : false;

  async function schedule() {
    if (!account || busy) return;
    const first = new Date(startAt);
    if (Number.isNaN(first.getTime()) || first.getTime() < Date.now() + 5 * 60_000) {
      setError("Pick a start time at least 5 minutes from now.");
      return;
    }
    setBusy(true);
    setError(null);
    let scheduled = 0;
    let failed = 0;
    let firstError: string | null = null;
    // One at a time: the route checks quotas and tokens per call.
    for (const [i, clip] of clips.entries()) {
      try {
        await apiFetch(`/api/projects/${projectId}/clips/${clip.id}/publish`, {
          method: "POST",
          body: JSON.stringify({ socialAccountId: account.id, scheduledFor: new Date(first.getTime() + i * DAY_MS).toISOString() }),
        });
        scheduled++;
      } catch (e) {
        failed++;
        firstError ??= e instanceof Error ? e.message : "Couldn't schedule a clip";
      }
    }
    setBusy(false);
    if (firstError) setError(firstError);
    if (scheduled > 0) setDone({ kind: "post", scheduled, failed, provider: PROVIDER_LABEL[account.provider] ?? account.provider, first });
  }

  return (
    <div className={`flex min-h-full flex-col ${s.page}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-6 sm:px-8">
        <div className="min-w-0 max-w-[460px]">
          <Breadcrumbs items={[{ label: "Your projects", href: "/dashboard/projects" }, { label: title, href: projectHref }, { label: "Post or download" }]} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={reviewHref} className="inline-flex h-10 items-center rounded-full border border-line-strong px-4 text-[13px] font-semibold text-fg hover:bg-surface-2">← Back to picking</Link>
          <Link href={projectHref} className="inline-flex h-10 items-center rounded-full border border-line-strong px-4 text-[13px] font-semibold text-fg hover:bg-surface-2">View all clips</Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center gap-8 px-6 pb-16 pt-6 text-center">
        {!data && !query.error && <Skeleton className="h-[290px] w-[480px] max-w-full rounded-3xl" />}

        {data && n === 0 && (
          <div className="flex max-w-md flex-col items-center gap-3 pt-10">
            <h1 className="text-[32px] font-bold tracking-[-0.03em] text-fg">No finished clips to share yet</h1>
            <p className="text-fg-muted">They show up here as soon as they finish rendering.</p>
            <Link href={projectHref} className="mt-2 inline-flex h-11 items-center rounded-full bg-primary px-5 font-semibold text-on-primary">Back to the project</Link>
          </div>
        )}

        {n > 0 && (
          <>
            <div className={s.fan} aria-label={`Your ${n} clip${n === 1 ? "" : "s"}`}>
              {clips.slice(0, 5).map((c, i, arr) => {
                const mid = (arr.length - 1) / 2;
                const off = i - mid;
                return (
                  <span key={c.id} style={{ transform: `translateX(${off * 125}px) rotate(${off * 7}deg)`, zIndex: 10 - Math.abs(Math.round(off)), animationDelay: `${i * 0.1}s` }}>
                    {c.thumbnailUrl ? <img src={c.thumbnailUrl} alt={clipName(c)} /> : <video src={c.videoUrl ?? undefined} muted playsInline aria-label={clipName(c)} />}
                  </span>
                );
              })}
            </div>

            {!done ? (
              <>
                <div className="flex flex-col gap-2">
                  <h1 className="text-[40px] font-bold leading-none tracking-[-0.04em] text-fg sm:text-[56px]">{n} clip{n === 1 ? "" : "s"}, ready to go.</h1>
                  <p className="text-[17px] text-fg-muted">Where should {n === 1 ? "it" : "they"} go?</p>
                </div>
                <div className="grid w-full max-w-[900px] grid-cols-1 gap-4 text-left md:grid-cols-2">
                  <section className={`${s.choice} flex flex-col gap-3.5 rounded-3xl border border-line bg-surface-1 p-6`}>
                    <span className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></svg>
                    </span>
                    <h2 className="text-[22px] font-bold text-fg">Post them for me</h2>
                    <p className="text-sm leading-relaxed text-fg-muted">One clip a day, starting when you choose.</p>
                    {accountsQuery.isLoading ? (
                      <Skeleton className="h-11 w-full rounded-xl" />
                    ) : accounts.length === 0 ? (
                      <p className="rounded-xl border border-line bg-surface-2 p-3 text-[13px] text-fg-muted">
                        Connect an account in <Link href="/dashboard/social-tracker" className="font-semibold text-primary">Social Tracker</Link> to post from here.
                      </p>
                    ) : (
                      <>
                        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-fg">
                          Account
                          <select value={account?.id ?? ""} onChange={(e) => setAccountId(e.target.value)} className="h-11 rounded-xl border border-line bg-surface-2 px-3 text-sm font-normal text-fg outline-none focus:border-primary/60">
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>{PROVIDER_LABEL[a.provider] ?? a.provider} · {a.displayName ?? a.username ?? "account"}</option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-fg">
                          First post
                          <input type="datetime-local" value={startAt} min={minStart} onChange={(e) => setStartAt(e.target.value)} className="h-11 rounded-xl border border-line bg-surface-2 px-3 text-sm font-normal text-fg outline-none focus:border-primary/60" />
                        </label>
                        {!autoProvider && account && (
                          <p className="text-xs text-fg-muted">
                            We can only upload to YouTube automatically. For {PROVIDER_LABEL[account.provider] ?? account.provider}, each clip is added to your schedule and you post it yourself when it’s due.
                          </p>
                        )}
                        {error && <p role="alert" className="rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-xs font-medium text-error">{error}</p>}
                        <button type="button" onClick={schedule} disabled={busy} aria-busy={busy || undefined} className="mt-1 inline-flex h-[52px] items-center justify-center rounded-full bg-primary px-6 font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50">
                          {busy ? "Scheduling…" : `Schedule ${n} clip${n === 1 ? "" : "s"}`}
                        </button>
                      </>
                    )}
                  </section>
                  <section className={`${s.choice} flex flex-col gap-3.5 rounded-3xl border border-line bg-surface-1 p-6`}>
                    <span className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></svg>
                    </span>
                    <h2 className="text-[22px] font-bold text-fg">I’ll post them myself</h2>
                    <p className="text-sm leading-relaxed text-fg-muted">Every clip as an MP4 in one zip.</p>
                    <ul className="flex flex-col gap-2 text-sm text-fg">
                      {clips.slice(0, 4).map((c) => (
                        <li key={c.id} className="truncate rounded-xl border border-line bg-surface-2 px-3 py-2.5">{clipName(c)}</li>
                      ))}
                      {n > 4 && <li className="px-3 text-[13px] text-fg-muted">+ {n - 4} more</li>}
                    </ul>
                    <a href={zipHref} onClick={() => setDone({ kind: "download" })} className="mt-auto inline-flex h-[52px] items-center justify-center rounded-full border border-line-strong bg-surface-2 px-6 font-semibold text-fg hover:bg-surface-3">
                      Download ZIP
                    </a>
                  </section>
                </div>
              </>
            ) : (
              <section role="status" className={`${s.pop} flex w-full max-w-[620px] flex-col items-center gap-3.5 rounded-3xl border border-line bg-surface-1 p-7`}>
                <span className={`${s.okc} flex h-16 w-16 items-center justify-center rounded-full bg-success text-on-primary`}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
                </span>
                <h1 className="text-[26px] font-bold text-fg">
                  {done.kind === "post" ? `${done.scheduled} clip${done.scheduled === 1 ? "" : "s"} scheduled` : "Your ZIP is downloading"}
                </h1>
                <p className="text-[15px] leading-relaxed text-fg-muted">
                  {done.kind === "post"
                    ? `The first goes out ${done.first.toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" })} on ${done.provider}, then one a day.${done.failed ? ` ${done.failed} couldn’t be scheduled — try those from the project.` : ""}`
                    : "Every clip stays in your project if you need it again."}
                </p>
                <div className="mt-1.5 flex flex-wrap justify-center gap-2.5">
                  <Link href={projectHref} className="inline-flex h-12 items-center rounded-full bg-primary px-6 font-semibold text-on-primary hover:bg-primary-hover">Go to project →</Link>
                  <Link href={`${projectHref}?layout=list`} className="inline-flex h-12 items-center rounded-full border border-line-strong px-5 font-semibold text-fg hover:bg-surface-2">See clip details</Link>
                  <button type="button" onClick={() => setDone(null)} className="inline-flex h-12 items-center rounded-full border border-line-strong px-5 font-semibold text-fg hover:bg-surface-2">Back</button>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
