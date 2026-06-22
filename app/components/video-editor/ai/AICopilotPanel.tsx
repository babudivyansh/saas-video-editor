"use client";

import { useState, useRef, useCallback } from "react";
import { useEditorStore } from "../store/editorStore";

interface Message { role: "user" | "assistant"; content: string }

function token() {
  return typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : "";
}

const QUICK_ACTIONS = [
  "Remove silences",
  "Add zoom effect",
  "Improve pacing",
  "Create viral reel",
  "Add transitions",
  "Enhance captions",
];

export default function AICopilotPanel() {
  const setAICopilotOpen = useEditorStore(s => s.setAICopilotOpen);
  const present = useEditorStore(s => s.present);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! I'm your AI editing copilot. Tell me what you want to do with your video — I'll help make it happen." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/editor/ai-copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ command: text, doc: present }),
      });
      const data = await res.json();
      const reply = data.message ?? "I couldn't process that command. Try rephrasing.";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 50);
    }
  }, [loading, present]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4" style={{ pointerEvents: "none" }}>
      <div
        className="flex flex-col rounded-2xl shadow-2xl overflow-hidden"
        style={{ width: 380, height: 500, background: "#18181b", border: "1px solid #27272a", pointerEvents: "all" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #27272a" }}>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg,#6366f1,#2563eb)" }}>
              <svg viewBox="0 0 24 24" fill="white" className="w-3.5 h-3.5"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" /></svg>
            </div>
            <span className="text-sm font-semibold" style={{ color: "#e4e4e7" }}>AI Copilot</span>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#22c55e" }} />
          </div>
          <button onClick={() => setAICopilotOpen(false)} style={{ color: "#71717a" }} className="hover:text-white transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
              <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className="rounded-xl px-3 py-2 text-xs max-w-[80%]"
                style={{
                  background: m.role === "user" ? "#1e3a5f" : "#1e1e22",
                  color: m.role === "user" ? "#93c5fd" : "#a1a1aa",
                  border: `1px solid ${m.role === "user" ? "#2563eb33" : "#27272a"}`,
                }}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-xl px-3 py-2" style={{ background: "#1e1e22", border: "1px solid #27272a" }}>
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#52525b", animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="px-3 py-1.5 flex flex-wrap gap-1" style={{ borderTop: "1px solid #1a1a1e" }}>
          {QUICK_ACTIONS.map(a => (
            <button
              key={a}
              onClick={() => send(a)}
              className="rounded-full px-2 py-0.5 text-xs transition-all"
              style={{ background: "#1e1e22", color: "#71717a", border: "1px solid #27272a" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#e4e4e7"; (e.currentTarget as HTMLElement).style.borderColor = "#3f3f46"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#71717a"; (e.currentTarget as HTMLElement).style.borderColor = "#27272a"; }}
            >
              {a}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="flex gap-2 px-3 py-2" style={{ borderTop: "1px solid #27272a" }}>
          <input
            type="text"
            placeholder="Tell me what to do…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && send(input)}
            disabled={loading}
            className="flex-1 rounded-lg px-3 py-1.5 text-xs outline-none"
            style={{ background: "#111113", border: "1px solid #27272a", color: "#e4e4e7" }}
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
            style={{ background: input.trim() ? "#2563eb" : "#27272a", color: "white" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <line x1="22" y1="2" x2="11" y2="13" strokeLinecap="round" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
