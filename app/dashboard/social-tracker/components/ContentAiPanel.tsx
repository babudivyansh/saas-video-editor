"use client";

// "What should I make next?" — the Content tab's own question, answered by two
// tools that were built, priced, tested and then never given a way in.
//
// Both live here rather than on the Overview because they are about the NEXT
// post, not about how the account is doing. Recommendations read your own post
// history; captions take a brief and are informed by the same factsheet. That
// is what keeps a drafting tool defensible on an analytics surface: it is
// answering from the analytics.
//
// Every credit-spending action states its price before the click and asks
// again, the same contract AiInsightsPanel established.

import { useCallback, useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { FieldLabel, Input } from "@/app/components/ui/Field";
import { Panel } from "@/app/components/dashboard";
import type { CaptionSuggestions, ContentRecommendations } from "@/lib/social/ai/schemas";
import { SocialApiError, useSocialApi } from "./useSocialApi";

const PRIORITY_TONE: Record<string, string> = {
  high: "bg-tint-rose text-error",
  medium: "bg-tint-amber text-warning",
  low: "bg-tint-emerald text-success",
};

type Busy = null | "recommendations" | "captions";

/** Turns an API failure into something the user can act on. */
function messageFor(e: unknown): string {
  if (!(e instanceof SocialApiError)) return "Something went wrong — please try again.";
  if (e.status === 402) return "You're out of credits. Top up and try again.";
  if (e.status === 409) return "Not enough post history yet — publish a few more and come back.";
  if (e.status === 429) return "Too many requests just now. Give it a minute.";
  if (e.status === 502) return "The model didn't respond. You have not been charged.";
  return e.message;
}

export function ContentAiPanel({
  accountId,
  accountLabel,
  tz,
  range,
  recommendationsCost,
  captionCost,
  initialRecommendations,
  generatedAt,
}: {
  accountId: string;
  accountLabel: string;
  tz: string;
  range: number;
  recommendationsCost: number;
  captionCost: number;
  initialRecommendations: ContentRecommendations | null;
  generatedAt: string | null;
}) {
  const api = useSocialApi();
  const [recommendations, setRecommendations] = useState(initialRecommendations);
  const [captions, setCaptions] = useState<CaptionSuggestions | null>(null);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [confirming, setConfirming] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const generateRecommendations = useCallback(async () => {
    setConfirming(null);
    setBusy("recommendations");
    setError(null);
    try {
      const data = await api<{ recommendations: { content: ContentRecommendations } }>(
        "/api/social/recommendations",
        { method: "POST", body: JSON.stringify({ accountId, range, tz }) },
      );
      // The route stores the generation and returns the stored row; the
      // generated object is its `content`.
      setRecommendations(
        (data.recommendations as unknown as { content: ContentRecommendations }).content ??
          (data.recommendations as unknown as ContentRecommendations),
      );
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(null);
    }
  }, [api, accountId, range, tz]);

  const generateCaptions = useCallback(async () => {
    setConfirming(null);
    setBusy("captions");
    setError(null);
    try {
      const data = await api<{ captions: CaptionSuggestions }>("/api/social/captions", {
        method: "POST",
        body: JSON.stringify({ accountId, brief: brief.trim(), tz }),
      });
      setCaptions(data.captions);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(null);
    }
  }, [api, accountId, brief, tz]);

  return (
    <Panel
      title="What to make next"
      subtitle={
        generatedAt
          ? `Last generated ${new Date(generatedAt).toLocaleDateString()} · ${accountLabel}`
          : accountLabel
      }
    >
      {error && (
        <p role="alert" className="mb-3 rounded-xl border border-tint-amber-border bg-tint-amber px-3 py-2 text-xs text-warning">
          {error}
        </p>
      )}

      <div className="space-y-5">
        <section aria-labelledby="recs-heading">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 id="recs-heading" className="text-xs font-bold uppercase tracking-wide text-fg-subtle">
              Recommendations
            </h3>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy !== null}
              onClick={() => setConfirming("recommendations")}
            >
              {busy === "recommendations"
                ? "Working…"
                : `${recommendations ? "Regenerate" : "Generate"} · ${recommendationsCost} credits`}
            </Button>
          </div>

          {recommendations ? (
            <ul className="space-y-2">
              {recommendations.recommendations.map((r) => (
                <li key={r.title} className="rounded-xl bg-surface-3 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-fg">{r.title}</p>
                    <span
                      className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        PRIORITY_TONE[r.priority] ?? "bg-surface-2 text-fg-subtle"
                      }`}
                    >
                      {r.priority}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">{r.why}</p>
                  {r.contentType && (
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
                      {r.contentType}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-fg-subtle">
              Reads your own post history and suggests what to publish next.
            </p>
          )}
        </section>

        <section aria-labelledby="captions-heading" className="border-t border-line pt-4">
          <h3 id="captions-heading" className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-subtle">
            Draft a caption
          </h3>

          <FieldLabel htmlFor="caption-brief">What is the post about?</FieldLabel>
          <Input
            id="caption-brief"
            value={brief}
            maxLength={500}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="A 40-second clip on why most podcasts lose people in the first ten seconds"
          />

          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy !== null || brief.trim().length === 0}
              onClick={() => setConfirming("captions")}
            >
              {busy === "captions" ? "Writing…" : `Draft · ${captionCost} credit${captionCost === 1 ? "" : "s"}`}
            </Button>
          </div>

          {captions && (
            <div className="mt-3 space-y-2">
              {captions.captions.map((c) => (
                <div key={c.text} className="rounded-xl bg-surface-3 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">{c.tone}</p>
                  <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-fg">{c.text}</p>
                </div>
              ))}
              {captions.hashtags.length > 0 && (
                <p className="text-[11px] text-fg-muted">
                  {/* The model keeps omitting the '#', so the UI owns it. */}
                  {captions.hashtags.map((h) => `#${h}`).join(" ")}
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirming === "recommendations"}
        title="Generate recommendations?"
        message={`This spends ${recommendationsCost} credits and reads this account's recent posts.`}
        confirmLabel={`Spend ${recommendationsCost} credits`}
        onConfirm={generateRecommendations}
        onClose={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming === "captions"}
        title="Draft captions?"
        message={`This spends ${captionCost} credit${captionCost === 1 ? "" : "s"}.`}
        confirmLabel={`Spend ${captionCost} credit${captionCost === 1 ? "" : "s"}`}
        onConfirm={generateCaptions}
        onClose={() => setConfirming(null)}
      />
    </Panel>
  );
}
