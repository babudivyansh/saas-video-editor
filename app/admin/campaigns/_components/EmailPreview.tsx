"use client";
import { useEffect, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { useCampaignApi } from "./useCampaignApi";
import type { CampaignBlock } from "./types";

/**
 * The email as a recipient sees it, re-rendered by the server (the same code
 * that sends it) a moment after each edit. Shown in a sandboxed iframe with
 * scripts off; the markup is our own renderer's, every admin string escaped.
 */
export function EmailPreview({ subject, preheader, blocks }: { subject: string; preheader: string; blocks: CampaignBlock[] }) {
  const api = useCampaignApi();
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const input = JSON.stringify({ subject, preheader, blocks });

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const body = JSON.parse(input) as { subject: string; preheader: string; blocks: CampaignBlock[] };
        const r = await api<{ html: string }>("/preview", {
          body: { subject: body.subject || "(no subject)", preheader: body.preheader || "(no preview text)", blocks: body.blocks },
        });
        if (!cancelled) { setHtml(r.html); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Preview failed");
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [api, input]);

  return (
    <div className="rounded-2xl border border-line bg-panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg truncate">{subject || "(no subject)"}</p>
          <p className="text-xs text-fg-subtle truncate">{preheader || "(no preview text)"}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0" role="group" aria-label="Preview width">
          <WidthButton active={!mobile} onClick={() => setMobile(false)} label="Desktop"><Monitor size={14} /></WidthButton>
          <WidthButton active={mobile} onClick={() => setMobile(true)} label="Mobile"><Smartphone size={14} /></WidthButton>
        </div>
      </div>
      {error && <p className="text-xs text-error bg-error/10 px-4 py-2">{error}</p>}
      <div className="bg-surface-2 flex justify-center py-4">
        {html ? (
          <iframe
            title="Email preview"
            sandbox=""
            srcDoc={html}
            className="border-0 rounded-lg transition-[width] duration-200"
            style={{ width: mobile ? 375 : "100%", maxWidth: 680, height: 760 }}
          />
        ) : (
          <p className="text-sm text-fg-subtle py-20">Rendering preview…</p>
        )}
      </div>
    </div>
  );
}

function WidthButton({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={`rounded-md p-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${active ? "bg-surface-3 text-fg" : "text-fg-subtle hover:text-fg"}`}
    >
      {children}
    </button>
  );
}
