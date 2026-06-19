"use client";

import { useState } from "react";
import { useAuth } from "./AuthContext";

type Stage = "idle" | "loading" | "done" | "error";
interface Idea { title: string; description: string; }

const TOPIC_CHIPS = ["Sports", "TV Shows", "Gardening", "Motivational", "Countries", "Inventions"];
const TONES = ["Mystery", "Horror", "Funny", "Suspense", "Action", "Informative", "Educational", "Inspiring", "Dramatic", "Casual"];
const VIDEO_TYPES = ["Reddit Story", "Fake Texts", "Split Screen"];

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

function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
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
    <div className="border border-gray-100 rounded-xl p-4 bg-white hover:border-gray-200 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-bold flex items-center justify-center mt-0.5">
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-gray-900 leading-snug">{idea.title}</p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{idea.description}</p>
          </div>
        </div>
        <button
          onClick={handleCopy}
          title="Copy idea"
          className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${copied ? "text-green-600 bg-green-50" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"}`}
        >
          {copied ? <IcCheck /> : <IcCopy />}
        </button>
      </div>
    </div>
  );
}

export default function BrainstormerTool() {
  const { refreshUser } = useAuth();

  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [videoType, setVideoType] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const canGenerate = topic.trim().length > 0 && stage !== "loading";

  const handleGenerate = async () => {
    if (!canGenerate) return;

    const token = localStorage.getItem("token");
    if (!token) { setErrorMsg("Please log in to use this tool."); setStage("error"); return; }

    setStage("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/tools/brainstormer", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), tone, targetAudience: targetAudience.trim(), videoType }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);

      setIdeas(data.ideas ?? []);
      await refreshUser();
      setStage("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setStage("error");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-5xl mx-auto flex gap-5">

        {/* ── Left panel ── */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">

          {/* Topic */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-2">Topic</label>
            <input
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="Generate ideas for a niche to start a page on"
              className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
            />
            <div className="flex flex-wrap gap-2 mt-2.5">
              {TOPIC_CHIPS.map(chip => (
                <button
                  key={chip}
                  onClick={() => setTopic(chip)}
                  className={`px-3 py-1 rounded-lg border text-xs font-medium transition-colors ${
                    topic === chip
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Tone */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-2">Select the tone for your ideas</label>
            <div className="relative">
              <select
                value={tone}
                onChange={e => setTone(e.target.value)}
                className="w-full appearance-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all bg-white pr-8"
              >
                <option value="">Select Tone</option>
                {TONES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none">
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          {/* Target audience */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-2">Target audience</label>
            <input
              type="text"
              value={targetAudience}
              onChange={e => setTargetAudience(e.target.value)}
              placeholder="30-40 year old moms in the US"
              className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
            />
          </div>

          {/* Video type */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-2">Video type</label>
            <div className="flex gap-2 flex-wrap">
              {VIDEO_TYPES.map(vt => (
                <button
                  key={vt}
                  onClick={() => setVideoType(prev => prev === vt ? "" : vt)}
                  className={`px-3.5 py-2 rounded-lg border text-xs font-medium transition-colors ${
                    videoType === vt
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {vt}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {errorMsg && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{errorMsg}</p>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #335CFF 0%, #7B5EA7 100%)" }}
          >
            {stage === "loading" ? (
              <><Spinner /> Generating ideas…</>
            ) : (
              <><IcSparkle /> Generate ideas</>
            )}
          </button>
        </div>

        {/* ── Right panel ── */}
        <div className="w-96 flex-shrink-0 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 flex-shrink-0">
            <IcSparkle className="w-3.5 h-3.5 text-indigo-500" />
            <p className="text-sm font-semibold text-gray-800">Your idea will appear here</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {stage === "idle" && (
              <div className="space-y-2 pt-1">
                {[1, 0.9, 0.95, 0.7, 0.85, 0.6, 0.75, 0.88].map((w, i) => (
                  <div key={i} className="h-2 rounded-full bg-gray-100" style={{ width: `${w * 100}%` }} />
                ))}
                <p className="text-xs text-gray-400 mt-4 leading-relaxed">
                  Lorem ipsum is simply dummy text of the printing and typesetting industry. Ideas will appear here once you generate.
                </p>
              </div>
            )}

            {stage === "loading" && (
              <div className="space-y-2 pt-1">
                {[1, 0.9, 0.95, 0.7, 0.85, 0.6, 0.75, 0.88].map((w, i) => (
                  <div
                    key={i}
                    className="h-2 rounded-full bg-gray-100 animate-pulse"
                    style={{ width: `${w * 100}%`, animationDelay: `${i * 80}ms` }}
                  />
                ))}
              </div>
            )}

            {stage === "done" && ideas.length > 0 && (
              <div className="space-y-3">
                {ideas.map((idea, i) => (
                  <IdeaCard key={i} idea={idea} index={i} />
                ))}
              </div>
            )}

            {stage === "error" && !errorMsg && (
              <p className="text-sm text-red-500 mt-4">Generation failed. Please try again.</p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
