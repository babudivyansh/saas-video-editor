"use client";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Input, Textarea } from "@/app/components/ui/Field";
import { BLOCK_LABEL, newBlock, type CampaignBlock, type CampaignBlockKind } from "./types";

const ADDABLE: CampaignBlockKind[] = ["heading", "paragraph", "image", "offer", "coupon", "button", "list", "callout", "divider", "spacer"];
const select = "w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary/40";

function Labeled({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-fg-subtle block mb-1">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-fg-subtle block mt-1">{hint}</span>}
    </label>
  );
}

function Fields({ block, onChange, disabled }: { block: CampaignBlock; onChange: (b: CampaignBlock) => void; disabled: boolean }) {
  const set = (patch: Record<string, unknown>) => onChange({ ...block, ...patch } as CampaignBlock);
  switch (block.kind) {
    case "heading":
      return <Labeled label="Heading" hint="{{name}} becomes the reader's first name."><Input disabled={disabled} value={block.text} maxLength={200} onChange={(e) => set({ text: e.target.value })} /></Labeled>;
    case "paragraph":
      return <Labeled label="Text" hint="A blank line starts a new paragraph. {{name}} works here too."><Textarea disabled={disabled} rows={4} value={block.text} maxLength={5000} onChange={(e) => set({ text: e.target.value })} /></Labeled>;
    case "button":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Labeled label="Label"><Input disabled={disabled} value={block.label} maxLength={60} onChange={(e) => set({ label: e.target.value })} /></Labeled>
          <Labeled label="Link" hint="/pricing or https://…"><Input disabled={disabled} value={block.href} onChange={(e) => set({ href: e.target.value })} /></Labeled>
        </div>
      );
    case "image":
      return (
        <div className="grid grid-cols-1 gap-3">
          <Labeled label="Image URL" hint="A public https:// image, 1040px wide works best. Our media bucket is private, so put the file in /public or use a public host.">
            <Input disabled={disabled} value={block.src} placeholder="https://clipiro.com/email/black-friday.png" onChange={(e) => set({ src: e.target.value })} />
          </Labeled>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Labeled label="Alt text" hint="Shown when images are blocked."><Input disabled={disabled} value={block.alt} maxLength={200} onChange={(e) => set({ alt: e.target.value })} /></Labeled>
            <Labeled label="Link (optional)"><Input disabled={disabled} value={block.href ?? ""} onChange={(e) => set({ href: e.target.value || undefined })} /></Labeled>
          </div>
        </div>
      );
    case "offer":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Labeled label="Label"><Input disabled={disabled} value={block.label} maxLength={80} onChange={(e) => set({ label: e.target.value })} /></Labeled>
          <Labeled label="Price / headline"><Input disabled={disabled} value={block.price} maxLength={40} onChange={(e) => set({ price: e.target.value })} /></Labeled>
          <Labeled label="Was (optional, shown crossed out)"><Input disabled={disabled} value={block.was ?? ""} maxLength={40} onChange={(e) => set({ was: e.target.value })} /></Labeled>
          <Labeled label="Caption (optional)"><Input disabled={disabled} value={block.caption ?? ""} maxLength={200} onChange={(e) => set({ caption: e.target.value })} /></Labeled>
        </div>
      );
    case "coupon":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Labeled label="Code"><Input disabled={disabled} value={block.code} maxLength={40} onChange={(e) => set({ code: e.target.value.toUpperCase() })} /></Labeled>
          <Labeled label="Caption (optional)"><Input disabled={disabled} value={block.caption ?? ""} maxLength={200} onChange={(e) => set({ caption: e.target.value })} /></Labeled>
        </div>
      );
    case "callout":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Labeled label="Colour">
            <select className={select} disabled={disabled} value={block.tone} onChange={(e) => set({ tone: e.target.value })}>
              <option value="brand">Brand</option>
              <option value="success">Green</option>
              <option value="warning">Amber</option>
              <option value="neutral">Grey</option>
            </select>
          </Labeled>
          <Labeled label="Title (optional)"><Input disabled={disabled} value={block.title ?? ""} maxLength={120} onChange={(e) => set({ title: e.target.value })} /></Labeled>
          <div className="sm:col-span-2"><Labeled label="Text"><Textarea disabled={disabled} rows={2} value={block.body} maxLength={1000} onChange={(e) => set({ body: e.target.value })} /></Labeled></div>
        </div>
      );
    case "list":
      return (
        <Labeled label="Items" hint="One per line, up to 12.">
          <Textarea
            disabled={disabled}
            rows={Math.max(3, block.items.length)}
            value={block.items.join("\n")}
            onChange={(e) => set({ items: e.target.value.split("\n").slice(0, 12) })}
          />
        </Labeled>
      );
    case "divider":
    case "spacer":
      return <p className="text-xs text-fg-subtle">{block.kind === "divider" ? "A thin line." : "Extra space."}</p>;
  }
}

export function BlockEditor({
  blocks,
  onChange,
  disabled = false,
}: {
  blocks: CampaignBlock[];
  onChange: (blocks: CampaignBlock[]) => void;
  disabled?: boolean;
}) {
  const update = (i: number, b: CampaignBlock) => onChange(blocks.map((x, j) => (j === i ? b : x)));
  const remove = (i: number) => onChange(blocks.filter((_, j) => j !== i));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {blocks.map((b, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface-2/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wide text-fg-muted">
              {i + 1}. {BLOCK_LABEL[b.kind]}
            </span>
            {!disabled && (
              <div className="flex items-center gap-1">
                <IconButton label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp size={14} /></IconButton>
                <IconButton label="Move down" onClick={() => move(i, 1)} disabled={i === blocks.length - 1}><ArrowDown size={14} /></IconButton>
                <IconButton label="Remove block" onClick={() => remove(i)} disabled={blocks.length <= 1}><Trash2 size={14} /></IconButton>
              </div>
            )}
          </div>
          <Fields block={b} onChange={(nb) => update(i, nb)} disabled={disabled} />
        </div>
      ))}

      {!disabled && blocks.length < 40 && (
        <div className="rounded-xl border border-dashed border-line-strong p-3">
          <p className="text-xs font-semibold text-fg-subtle mb-2 flex items-center gap-1"><Plus size={12} /> Add a block</p>
          <div className="flex flex-wrap gap-1.5">
            {ADDABLE.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onChange([...blocks, newBlock(k)])}
                className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-fg-muted hover:text-fg hover:border-line-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                {BLOCK_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md p-1.5 text-fg-subtle hover:text-fg hover:bg-surface-3 disabled:opacity-30 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      {children}
    </button>
  );
}
