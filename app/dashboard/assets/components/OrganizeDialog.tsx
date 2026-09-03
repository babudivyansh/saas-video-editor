"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/app/components/ui/Modal";
import { Button } from "@/app/components/ui/Button";
import type { Asset, AssetFolder, Tag } from "../types";

// Move-to-folder and tagging for a single asset.
//
// Neither had any UI. Moving one asset was drag-to-sidebar only — impossible
// on touch, and undiscoverable — and single-asset tagging had no entry point
// at all, which is why `mutations.setTags` sat in the codebase fully written
// and never once called.

interface Props {
  asset: Asset | null;
  folders: AssetFolder[];
  allTags: Tag[];
  onClose: () => void;
  onSave: (changes: { folderId: string | null; tags: string[] }) => void;
  saving?: boolean;
}

/** Tags are stored lowercased and deduped server-side; mirror that here so the
 *  chip list shows the user exactly what will be saved. */
function normalize(raw: string): string {
  return raw.trim().toLowerCase();
}

export function OrganizeDialog({ asset, folders, allTags, onClose, onSave, saving }: Props) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  // Reseed whenever a different asset is opened.
  useEffect(() => {
    if (!asset) return;
    setFolderId(asset.folder?.id ?? null);
    setTags(asset.tags.map((t) => t.name));
    setDraft("");
  }, [asset]);

  if (!asset) return null;

  function addTag(raw: string) {
    const name = normalize(raw);
    // The API caps tags at 30 per asset; stop here rather than letting the
    // request fail after the user has typed them all in.
    if (!name || tags.includes(name) || tags.length >= 30) return;
    setTags((prev) => [...prev, name]);
    setDraft("");
  }

  const suggestions = allTags
    .map((t) => t.name)
    .filter((name) => !tags.includes(name) && (!draft || name.includes(normalize(draft))))
    .slice(0, 8);

  return (
    <Modal open={!!asset} onClose={onClose} title="Organize" maxWidth="max-w-lg">
      <div className="space-y-5">
        <p className="text-xs text-ink-soft truncate">{asset.name}</p>

        <div className="space-y-2">
          <label htmlFor="organize-folder" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft/70">
            Folder
          </label>
          <select
            id="organize-folder"
            value={folderId ?? ""}
            onChange={(e) => setFolderId(e.target.value || null)}
            className="w-full text-sm bg-panel border border-card-border rounded-xl px-3 py-2 text-ink outline-none focus:border-brand cursor-pointer"
          >
            <option value="">Unfiled</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="organize-tag" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft/70">
            Tags
          </label>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-tint-violet text-accent-violet">
                  {t}
                  <button
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                    aria-label={`Remove tag ${t}`}
                    className="text-accent-violet/60 hover:text-accent-violet cursor-pointer"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          <input
            id="organize-tag"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag(draft);
              }
              if (e.key === "Backspace" && !draft && tags.length) {
                setTags((prev) => prev.slice(0, -1));
              }
            }}
            placeholder={tags.length >= 30 ? "Tag limit reached" : "Add a tag and press Enter…"}
            disabled={tags.length >= 30}
            className="w-full text-sm bg-panel border border-card-border rounded-xl px-3 py-2 text-ink placeholder:text-ink-soft/50 outline-none focus:border-brand disabled:opacity-60"
          />

          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {suggestions.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => addTag(name)}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-surface text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors cursor-pointer"
                >
                  + {name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={saving}
            onClick={() => onSave({ folderId, tags })}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
