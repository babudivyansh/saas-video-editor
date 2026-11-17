"use client";

// The composer: video → where → caption → when, on one full-screen page.
//
// YouTube is uploaded by Clipiro (now through the publish queue, or at the
// chosen time by the scheduler). Instagram and Facebook have no publishing
// API access without Meta App Review, so their posts become "your turn" when
// due: the Posts tab hands over the video and caption and takes the link back.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/app/components/ui/Modal";
import { Button } from "@/app/components/ui/Button";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { useToast } from "@/app/components/ui/Toast";
import type { BestSlot } from "@/lib/social/posts-web";
import { SocialApiError, useSocialApi } from "./useSocialApi";

export interface ComposerVideo {
  kind: "clip" | "asset";
  id: string;
  title: string;
  /** Project name for a clip, "Assets" for an upload. */
  subtitle: string;
  durationSec: number | null;
  thumbnailUrl: string | null;
}

interface ComposerAccount {
  id: string;
  provider: string;
  label: string;
  /** False when the connection needs reconnecting. */
  active: boolean;
}

const PROVIDER: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook" };
const AUTO = new Set(["youtube"]); // Mirrors AUTO_PUBLISH_PROVIDERS; that module pulls Prisma.
const META_CAPTION_MAX = 2200;
const YOUTUBE_CAPTION_MAX = 5000;
const TRACKER = "/dashboard/social-tracker";

type When = "now" | "best" | "custom";

/** "#Founders, startup" → ["#founders", "#startup"], de-duplicated. */
function parseHashtags(raw: string): string[] {
  const tags = raw
    .split(/[\s,]+/)
    .map((t) => t.trim().replace(/^#*/, ""))
    .filter(Boolean)
    .map((t) => `#${t.toLowerCase()}`);
  return [...new Set(tags)].slice(0, 30);
}

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function tomorrowAtSix() {
  const d = new Date(Date.now() + 86_400_000);
  d.setHours(18, 0, 0, 0);
  return d;
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const fmtDuration = (s: number | null) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);

export function Composer({
  videos,
  initialVideo,
  accounts,
  initialAccountIds,
  bestSlots,
  captionCost,
}: {
  videos: ComposerVideo[];
  initialVideo: { kind: "clip" | "asset"; id: string } | null;
  accounts: ComposerAccount[];
  initialAccountIds: string[];
  bestSlots: BestSlot[];
  captionCost: number;
}) {
  const router = useRouter();
  const api = useSocialApi();
  const { showToast } = useToast();

  const [video, setVideo] = useState<ComposerVideo | null>(
    () => (initialVideo && videos.find((v) => v.kind === initialVideo.kind && v.id === initialVideo.id)) || null,
  );
  const [library, setLibrary] = useState<"clip" | "asset">(initialVideo?.kind ?? "clip");
  const [search, setSearch] = useState("");
  const [accountIds, setAccountIds] = useState<string[]>(initialAccountIds);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState("");
  const [when, setWhen] = useState<When>(bestSlots.length > 0 ? "best" : "now");
  const [slot, setSlot] = useState(0);
  const [custom, setCustom] = useState(() => toLocalInput(tomorrowAtSix()));
  const [drafts, setDrafts] = useState<Array<{ tone: string; text: string }> | null>(null);
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [confirmDraft, setConfirmDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = accounts.filter((a) => accountIds.includes(a.id));
  const hasYouTube = chosen.some((a) => AUTO.has(a.provider));
  const manual = chosen.filter((a) => !AUTO.has(a.provider));
  const captionMax = manual.length > 0 ? META_CAPTION_MAX : YOUTUBE_CAPTION_MAX;

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return videos.filter((v) => v.kind === library && (!q || `${v.title} ${v.subtitle}`.toLowerCase().includes(q)));
  }, [videos, library, search]);

  const at = when === "now" ? null : when === "best" ? (bestSlots[slot]?.at ?? null) : custom ? new Date(custom).toISOString() : null;

  const close = () => {
    if (window.history.length > 1) router.back();
    else router.push(TRACKER);
  };

  const toggleAccount = (id: string) =>
    setAccountIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  async function draft() {
    setConfirmDraft(false);
    const brief = (caption.trim() || video?.title || "").slice(0, 500);
    if (!brief) {
      setError("Pick a video or write a line about it first, then draft.");
      return;
    }
    setDrafting(true);
    setError(null);
    try {
      const data = await api<{ captions: { captions: Array<{ tone: string; text: string }>; hashtags: string[] } }>(
        "/api/social/captions",
        {
          method: "POST",
          body: JSON.stringify({
            accountId: chosen[0]?.id ?? accounts[0]?.id,
            brief,
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        },
      );
      setDrafts(data.captions.captions);
      setDraftTags(data.captions.hashtags);
    } catch (e) {
      setError(
        e instanceof SocialApiError && e.status === 402
          ? "You're out of credits for drafting. Top up and try again."
          : e instanceof SocialApiError && e.status === 409
            ? "This account needs a few synced posts before drafts can use its history."
            : "Couldn't draft captions. You weren't charged.",
      );
    } finally {
      setDrafting(false);
    }
  }

  async function submit() {
    if (!video || chosen.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = await api<{ posts: unknown[]; warnings: string[] }>("/api/social/posts", {
        method: "POST",
        body: JSON.stringify({
          source: video.kind === "clip" ? { clipId: video.id } : { assetId: video.id },
          accountIds: chosen.map((a) => a.id),
          ...(hasYouTube && title.trim() ? { title: title.trim() } : {}),
          caption,
          hashtags: parseHashtags(tags),
          privacy: "public",
          when: at ?? "now",
        }),
      });
      const notes: string[] = [];
      if (data.warnings.includes("not_short")) notes.push("YouTube will post it as a regular video, not a Short.");
      if (data.warnings.includes("uploads_busy")) notes.push("Today's YouTube uploads are used up, so it goes out when they free up.");
      showToast(
        [at ? `Scheduled for ${fmtTime(at)}.` : manual.length && !hasYouTube ? "Added to Posts. It's your turn to post it." : "Posting now.", ...notes].join(" "),
        "success",
      );
      router.push(`${TRACKER}/posts?view=${at ? "scheduled" : manual.length && !hasYouTube ? "needs-you" : "scheduled"}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof SocialApiError ? e.message : "Couldn't save this post. Try again.");
      setSubmitting(false);
    }
  }

  const ready = video !== null && chosen.length > 0 && caption.length <= captionMax && (when !== "custom" || Boolean(custom));
  const label = submitting ? "Saving…" : at ? "Schedule" : hasYouTube ? "Post now" : "Add to Posts";

  return (
    <Modal open onClose={close} title="New post" variant="fullscreen">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-28">
        {/* 1 · Video */}
        <Step n={1} title="Video">
          {video ? (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
              <Thumb url={video.thumbnailUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-fg">{video.title}</p>
                <p className="text-xs text-fg-muted">
                  {video.subtitle}
                  {video.durationSec != null && ` · ${fmtDuration(video.durationSec)}`}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setVideo(null)}>
                Change
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div role="group" aria-label="Library" className="flex gap-1">
                  {(["clip", "asset"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={library === k}
                      onClick={() => setLibrary(k)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        library === k ? "bg-brand text-on-primary" : "border border-line bg-panel text-fg-muted hover:text-fg"
                      }`}
                    >
                      {k === "clip" ? "Clips" : "Assets"}
                    </button>
                  ))}
                </div>
                <input
                  type="search"
                  id="composer-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
                  aria-label="Search videos"
                  className="ml-auto w-48 rounded-full border border-line bg-panel px-3 py-1.5 text-xs text-fg"
                />
              </div>
              {shown.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-fg-muted">
                  {library === "clip" ? "No finished clips yet. Make some with AutoClip first." : "No videos in Assets yet."}
                </p>
              ) : (
                <ul className="grid max-h-[420px] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
                  {shown.map((v) => (
                    <li key={`${v.kind}-${v.id}`}>
                      <button
                        type="button"
                        onClick={() => setVideo(v)}
                        className="group block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <span className="relative block aspect-[9/16] overflow-hidden rounded-lg bg-surface-3">
                          {v.thumbnailUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={v.thumbnailUrl} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                          )}
                          {v.durationSec != null && (
                            <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] text-white">{fmtDuration(v.durationSec)}</span>
                          )}
                        </span>
                        <span className="mt-1 block truncate text-[11px] font-semibold text-fg">{v.title}</span>
                        <span className="block truncate text-[10px] text-fg-subtle">{v.subtitle}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Step>

        {/* 2 · Where */}
        <Step n={2} title="Where">
          {accounts.length === 0 ? (
            <p className="text-sm text-fg-muted">
              Connect YouTube under{" "}
              <a href={`${TRACKER}/settings`} className="font-semibold text-brand hover:underline">
                Settings
              </a>{" "}
              to post from Clipiro.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {accounts.map((a) => {
                  const on = accountIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={on}
                      disabled={!a.active}
                      onClick={() => toggleAccount(a.id)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                        on ? "border-brand bg-tint-emerald text-fg" : "border-line bg-panel text-fg-muted hover:text-fg"
                      }`}
                    >
                      {on ? "✓ " : ""}
                      {PROVIDER[a.provider] ?? a.provider} · {a.label}
                      {!a.active && " (reconnect first)"}
                    </button>
                  );
                })}
              </div>
              {manual.length > 0 && (
                <p className="text-xs text-fg-muted">
                  {manual.map((a) => PROVIDER[a.provider]).join(" and ")}: you post it yourself. When it&apos;s due it
                  shows under Posts with the video and caption ready to copy.
                </p>
              )}
            </div>
          )}
        </Step>

        {/* 3 · Caption */}
        <Step n={3} title="Caption">
          <div className="space-y-3">
            {hasYouTube && (
              <div>
                <label htmlFor="composer-title" className="mb-1 block text-xs font-semibold text-fg-muted">
                  YouTube title <span className="font-normal text-fg-subtle">(optional, defaults to the video&apos;s name)</span>
                </label>
                <input
                  id="composer-title"
                  value={title}
                  maxLength={100}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={video?.title ?? ""}
                  className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg"
                />
              </div>
            )}
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label htmlFor="composer-caption" className="text-xs font-semibold text-fg-muted">
                  Caption
                </label>
                <button
                  type="button"
                  onClick={() => (captionCost > 0 ? setConfirmDraft(true) : void draft())}
                  disabled={drafting || accounts.length === 0}
                  className="text-xs font-semibold text-brand hover:underline disabled:opacity-50"
                >
                  {drafting ? "Drafting…" : `Draft with AI${captionCost > 0 ? ` · ${captionCost} cr` : ""}`}
                </button>
              </div>
              <textarea
                id="composer-caption"
                rows={4}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="What's this clip about?"
                className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg"
              />
              <p className={`text-right text-[11px] ${caption.length > captionMax ? "text-error" : "text-fg-subtle"}`}>
                {caption.length.toLocaleString()} / {captionMax.toLocaleString()}
              </p>
            </div>
            {drafts && (
              <ul className="grid gap-2 sm:grid-cols-3">
                {drafts.map((d) => (
                  <li key={d.text}>
                    <button
                      type="button"
                      onClick={() => {
                        setCaption(d.text);
                        if (draftTags.length) setTags(draftTags.map((t) => `#${t.replace(/^#*/, "")}`).join(" "));
                      }}
                      className="h-full w-full rounded-xl border border-line bg-surface-2 p-3 text-left hover:border-brand"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-widest text-fg-subtle">{d.tone}</span>
                      <span className="mt-1 line-clamp-5 block whitespace-pre-wrap text-xs text-fg">{d.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div>
              <label htmlFor="composer-tags" className="mb-1 block text-xs font-semibold text-fg-muted">
                Hashtags
              </label>
              <input
                id="composer-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="#podcast #shorts"
                className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg"
              />
            </div>
          </div>
        </Step>

        {/* 4 · When */}
        <Step n={4} title="When">
          <div className="space-y-3">
            <div role="radiogroup" aria-label="When to post" className="flex flex-wrap gap-1">
              {(
                [
                  ["now", "Now"],
                  ...(bestSlots.length > 0 ? ([["best", "Best time"]] as const) : []),
                  ["custom", "Pick a time"],
                ] as Array<[When, string]>
              ).map(([value, text]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={when === value}
                  onClick={() => setWhen(value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    when === value ? "bg-brand text-on-primary" : "border border-line bg-panel text-fg-muted hover:text-fg"
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>
            {when === "best" && (
              <div className="flex flex-wrap gap-2">
                {bestSlots.map((s, i) => (
                  <button
                    key={s.at}
                    type="button"
                    aria-pressed={slot === i}
                    onClick={() => setSlot(i)}
                    className={`rounded-xl border px-3 py-2 text-left ${slot === i ? "border-brand bg-tint-emerald" : "border-line bg-surface-2"}`}
                  >
                    <span className="block text-xs font-semibold text-fg">{s.label}</span>
                    <span className="block text-[11px] text-fg-muted">
                      {s.engagementRate.toFixed(1)}% avg engagement · <span suppressHydrationWarning>{fmtTime(s.at)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {when === "custom" && (
              <input
                id="composer-time"
                type="datetime-local"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                aria-label="Post time"
                className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg"
              />
            )}
            {when === "best" && (
              <p className="text-[11px] text-fg-subtle">From when your past posts got the most engagement.</p>
            )}
          </div>
        </Step>

        {error && (
          <p role="alert" className="rounded-xl border border-tint-amber-border bg-tint-amber px-3 py-2 text-sm text-warning">
            {error}
          </p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-fg-muted" suppressHydrationWarning>
            {!video
              ? "Pick a video to post."
              : chosen.length === 0
                ? "Pick where to post it."
                : at
                  ? `Goes out ${fmtTime(at)}`
                  : hasYouTube
                    ? "Uploads to YouTube now."
                    : "Added to Posts for you to post."}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={close} type="button">
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={!ready} loading={submitting} type="button">
              {label}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDraft}
        title="Draft captions?"
        message={`This spends ${captionCost} credit${captionCost === 1 ? "" : "s"}.`}
        confirmLabel="Draft"
        onConfirm={draft}
        onClose={() => setConfirmDraft(false)}
      />
    </Modal>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`step-${n}`} className="rounded-[var(--radius-card)] border border-line bg-panel p-4 sm:p-5">
      <h2 id={`step-${n}`} className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg">
        <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-3 text-[11px] text-fg-muted">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Thumb({ url }: { url: string | null }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-16 w-9 flex-shrink-0 rounded-md bg-surface-3 object-cover" />
  ) : (
    <span aria-hidden="true" className="h-16 w-9 flex-shrink-0 rounded-md bg-surface-3" />
  );
}
