"use client";

import { useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { Tooltip } from "@/app/components/ui/Tooltip";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { Button } from "@/app/components/ui/Button";
import { ToolWorkspace, ToolBadge, ToolField, CostRow, StageEmpty } from "@/app/components/tools/ToolWorkspace";

function IcInfo() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>;
}

type Stage = "idle" | "loading" | "done" | "error";
interface Idea { title: string; description: string; }

const TOPIC_CHIPS = ["Sports", "TV Shows", "Gardening", "Motivational", "Countries", "Inventions"];
const TONES = ["Mystery", "Horror", "Funny", "Suspense", "Action", "Informative", "Educational", "Inspiring", "Dramatic", "Casual"];
const VIDEO_TYPES = ["Short-Form Clip", "Talking Head", "Tutorial"];

function IcSparkle({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
}

function IcCopy() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function IcCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}


function IdeaCard({ idea, index }: { idea: Idea; index: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(`${idea.title}\n\n${idea.description}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="rounded-xl border border-line bg-surface-1 p-4 transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="text-[14.5px] font-semibold leading-snug text-fg">{idea.title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{idea.description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          title="Copy idea"
          aria-label={copied ? "Copied" : `Copy idea ${index + 1}`}
          className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${copied ? "text-success bg-success/10" : "text-fg-subtle hover:text-fg hover:bg-surface-3"}`}
        >
          {copied ? <IcCheck /> : <IcCopy />}
        </button>
      </div>
    </div>
  );
}

export default function BrainstormerTool() {
  const { user, token, openAuthModal, refreshUser } = useAuth();
  const fireReviewPrompt = useReviewPromptTrigger();
  const submittingRef = useRef(false);

  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [videoType, setVideoType] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedAll, setCopiedAll] = useState(false);

  const copyAll = () => {
    const text = ideas.map((idea, i) => `${i + 1}. ${idea.title}\n${idea.description}`).join("\n\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    }).catch(() => { /* clipboard blocked */ });
  };

  const canGenerate = topic.trim().length > 0 && stage !== "loading";

  const handleGenerate = async () => {
    if (!canGenerate) return;
    if (!user || !token) { openAuthModal("login", "AI Brainstormer"); return; }
    if (submittingRef.current) return;
    submittingRef.current = true;

    setStage("loading");
    setErrorMsg("");

    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch("/api/tools/brainstormer", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), tone, targetAudience: targetAudience.trim(), videoType, idempotencyKey }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);

      setIdeas(data.ideas ?? []);
      await refreshUser();
      setStage("done");
      fireReviewPrompt("tool_generation_complete", { featureHint: "ai_tools" }).catch(() => { /* non-critical */ });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setStage("error");
    } finally {
      submittingRef.current = false;
    }
  };

  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${on ? "border-primary/50 bg-primary/10 text-fg" : "border-line text-fg-muted hover:border-line-strong hover:text-fg"}`;

  return (
    <ToolWorkspace
      title="AI Brainstormer"
      icon="bulb"
      badges={<ToolBadge tone="free">Free</ToolBadge>}
      description={`Five video ideas with hooks for your niche. ${user ? "Free with a daily allowance on your plan." : "5 a day on the free plan, 50 on paid plans."}`}
      controls={
        <>
          <ToolField label="Topic" hint={
            <Tooltip content="Narrower is better — 'vintage motorcycle restoration' beats 'motorcycles' for more specific, usable ideas.">
              <span className="cursor-help text-fg-subtle"><IcInfo /></span>
            </Tooltip>
          }>
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              maxLength={200}
              rows={3}
              aria-label="Topic"
              placeholder="A niche to start a page on, e.g. vintage motorcycle restoration"
              className="w-full resize-none rounded-xl border border-line bg-surface-1 px-3.5 py-2.5 text-sm text-fg outline-none transition placeholder:text-fg-subtle focus:border-primary/60 focus:ring-2 focus:ring-primary/25"
            />
            <div className="flex flex-wrap gap-2">
              {TOPIC_CHIPS.map(c => (
                <button key={c} type="button" onClick={() => setTopic(c)} aria-pressed={topic === c} className={chip(topic === c)}>{c}</button>
              ))}
            </div>
          </ToolField>

          <ToolField label="Tone">
            <div className="flex flex-wrap gap-2">
              {TONES.map(t => (
                <button key={t} type="button" onClick={() => setTone(prev => prev === t ? "" : t)} aria-pressed={tone === t} className={chip(tone === t)}>{t}</button>
              ))}
            </div>
          </ToolField>

          <ToolField label="Audience">
            <input
              type="text"
              value={targetAudience}
              onChange={e => setTargetAudience(e.target.value)}
              maxLength={200}
              aria-label="Target audience"
              placeholder="30–40 year old parents in the US"
              className="w-full rounded-xl border border-line bg-surface-1 px-3.5 py-2.5 text-sm text-fg outline-none transition placeholder:text-fg-subtle focus:border-primary/60 focus:ring-2 focus:ring-primary/25"
            />
          </ToolField>

          <ToolField label="Video type">
            <div className="flex flex-wrap gap-2">
              {VIDEO_TYPES.map(vt => (
                <button key={vt} type="button" onClick={() => setVideoType(prev => prev === vt ? "" : vt)} aria-pressed={videoType === vt} className={chip(videoType === vt)}>{vt}</button>
              ))}
            </div>
          </ToolField>
        </>
      }
      footer={
        <>
          {errorMsg && <p role="alert" className="rounded-xl bg-error/10 px-4 py-3 text-sm text-error">{errorMsg}</p>}
          <CostRow right={user ? "50 a day on paid plans" : undefined}>
            <span className="font-semibold text-fg">Free</span> · 5 runs a day on the free plan
          </CostRow>
          <Button type="button" className="w-full" onClick={() => void handleGenerate()} disabled={!canGenerate} loading={stage === "loading"}>
            {stage === "loading" ? "Generating ideas…" : <span className="inline-flex items-center gap-2"><IcSparkle /> Get 5 ideas</span>}
          </Button>
        </>
      }
      stageTitle={stage === "done" && ideas.length > 0 ? `${ideas.length} ideas` : "Ideas"}
      stageActions={
        stage === "done" && ideas.length > 0 ? (
          <Button type="button" size="sm" variant="secondary" onClick={copyAll}>{copiedAll ? "Copied" : "Copy all"}</Button>
        ) : undefined
      }
      stage={
        stage === "loading" ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-[76px] animate-pulse rounded-xl border border-line bg-surface-1" style={{ animationDelay: `${i * 90}ms` }} />
            ))}
          </div>
        ) : stage === "done" && ideas.length > 0 ? (
          <div className="flex flex-col gap-3">
            {ideas.length < 5 && (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                Only {ideas.length} idea{ideas.length === 1 ? "" : "s"} came back this time — try again for a full set of 5.
              </p>
            )}
            {ideas.map((idea, i) => <IdeaCard key={i} idea={idea} index={i} />)}
          </div>
        ) : stage === "error" && !errorMsg ? (
          <StageEmpty icon="bulb" title="That didn’t work">Generation failed. Please try again.</StageEmpty>
        ) : (
          <StageEmpty icon="bulb" title="Your five ideas appear here">
            Describe your niche and audience on the left. Each idea comes with a hook you can film today.
          </StageEmpty>
        )
      }
    />
  );
}
