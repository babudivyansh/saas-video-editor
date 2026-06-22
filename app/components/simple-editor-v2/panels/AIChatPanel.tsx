"use client";

import { useState, useRef, useEffect } from "react";
import { useSimpleEditorStore } from "../store/simpleEditorStore";

function token() {
  return typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : "";
}

interface Message {
  role: "user" | "ai";
  text: string;
}

const SUGGESTIONS = [
  "Make this more engaging",
  "Remove dead space",
  "Make captions larger",
  "Create a viral reel",
  "Improve the hook",
];

export default function AIChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", text: "Hi! I'm your AI editor. Tell me what you want to change and I'll do it automatically." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const videoUrl  = useSimpleEditorStore(s => s.videoUrl);
  const projectId = useSimpleEditorStore(s => s.projectId);
  const setCaptionsEnabled = useSimpleEditorStore(s => s.setCaptionsEnabled);
  const setCaptionStyle    = useSimpleEditorStore(s => s.setCaptionStyle);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const userMsg = text.trim();
    setInput("");
    setMessages(m => [...m, { role: "user", text: userMsg }]);
    setLoading(true);

    // Apply local actions immediately based on keywords
    const lower = userMsg.toLowerCase();
    if (lower.includes("caption")) setCaptionsEnabled(true);
    if (lower.includes("hormozi") || lower.includes("bold")) setCaptionStyle(10);
    if (lower.includes("mrbeast") || lower.includes("yellow")) setCaptionStyle(13);
    if (lower.includes("minimal") || lower.includes("clean")) setCaptionStyle(2);

    try {
      const res = await fetch("/api/editor/ai-copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ command: userMsg, doc: { videoUrl, projectId } }),
      });
      const data = await res.json();
      setMessages(m => [...m, { role: "ai", text: data.message ?? "Done! I've applied those changes." }]);
    } catch {
      setMessages(m => [...m, { role: "ai", text: "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 px-1 flex-shrink-0" style={{ color: "#6b7280" }}>
        AI Assistant
      </h3>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-2 min-h-0 mb-3 pr-1">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed"
              style={
                msg.role === "user"
                  ? { background: "#7C3AED", color: "white", borderBottomRightRadius: 4 }
                  : { background: "#111118", color: "#d1d5db", border: "1px solid rgba(255,255,255,0.06)", borderBottomLeftRadius: 4 }
              }
            >
              {msg.role === "ai" && (
                <span className="inline-block mr-1 text-xs" style={{ color: "#7C3AED" }}>✦</span>
              )}
              {msg.text}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div
              className="rounded-2xl px-4 py-3 flex gap-1 items-center"
              style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: "#7C3AED", animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick suggestion chips */}
      {messages.length < 3 && (
        <div className="flex flex-wrap gap-1.5 mb-3 flex-shrink-0">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => send(s)}
              className="text-xs px-2.5 py-1 rounded-full transition-all"
              style={{ background: "rgba(124,58,237,0.1)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.2)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(124,58,237,0.2)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(124,58,237,0.1)"; }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div
        className="flex gap-2 flex-shrink-0 rounded-xl overflow-hidden"
        style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send(input)}
          placeholder="Ask AI to edit your video…"
          className="flex-1 bg-transparent px-3 py-2.5 text-xs outline-none"
          style={{ color: "#e5e7eb" }}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          className="px-3 flex items-center justify-center transition-all"
          style={{ color: input.trim() ? "#7C3AED" : "#374151" }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
