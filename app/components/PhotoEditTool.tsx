"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "./AuthContext";
import { useModKey } from "./useModKey";
import { useJobPolling } from "./useJobPolling";
import { useModelOverrides } from "./useModelOverrides";
import { Button } from "@/app/components/ui/Button";
import { ToolWorkspace, ToolBadge, ToolField, CostRow, StageEmpty, StageProgress, Segmented, FileDrop } from "@/app/components/tools/ToolWorkspace";
import { AssetPicker } from "@/app/components/assets/AssetPicker";
import { uploadPickerAsset, type PickerAsset } from "@/app/components/assets/assetPickerData";
import { BeforeAfter } from "@/app/components/photo-edit/BeforeAfter";
import { MaskCanvas, type MaskCanvasHandle } from "@/app/components/photo-edit/MaskCanvas";
import { EDIT_MODELS, MAX_VARIATIONS, getEditModel } from "@/lib/models/editModels";
import { quote, FREE_DAILY_EDITS, type PhotoEditAction } from "@/lib/photo-edit/pricing";
import { EXPAND_RATIOS, type ExpandRatio } from "@/lib/photo-edit/ratios";
import { downloadFile } from "@/lib/download-file";

// Photo Edit workspace. One photo, a chain of versions: every edit applies to
// the version on screen and adds a new one, which the strip below lets the user
// go back to or branch from. All versions are Assets; the chain itself is
// rebuilt from /api/tools/photo-edit/history after a reload.

interface Version {
  key: string;
  assetId: string;
  url: string;
  label: string;
  /** Index of the version this one was made from; null for the original. */
  parent: number | null;
  model?: string | null;
}

interface StoredSession { chainId: string; originalAssetId: string }
const SESSION_KEY = "photo-edit:session";

const ACTIONS: readonly (readonly [PhotoEditAction, string])[] = [
  ["edit", "Edit"],
  ["erase", "Erase"],
  ["expand", "Expand"],
  ["upscale", "Upscale"],
  ["remove-bg", "Cut out"],
];

const PRESETS: { label: string; prompt: string }[] = [
  { label: "Change background", prompt: "Replace the background with " },
  { label: "Fix lighting", prompt: "Fix the lighting: balanced exposure, natural skin tones and soft, flattering light on the subject." },
  { label: "Make it a thumbnail", prompt: "Turn this into a bold YouTube thumbnail: punchy saturated colours, high contrast, the subject sharp, bright and slightly larger." },
  { label: "Studio portrait", prompt: "Make it a studio portrait: clean soft-grey backdrop and a soft key light from the left. Keep the face exactly the same." },
  { label: "Remove people behind", prompt: "Remove the people in the background and fill the space naturally." },
  { label: "Golden hour", prompt: "Relight the scene as golden hour: warm low sun from the side, long soft shadows." },
];

const ACTION_HINT: Record<PhotoEditAction, string> = {
  edit: "Describe the change. Auto picks the best model for it.",
  erase: "Paint over what to remove or change, then press Erase.",
  expand: "Grow the photo to a new shape. AI fills the new border.",
  upscale: "Sharpen and enlarge the photo.",
  "remove-bg": "Cut the subject out onto a transparent background.",
};

function creditLabel(n: number) { return `${n} ${n === 1 ? "credit" : "credits"}`; }
function newKey() { return Math.random().toString(36).slice(2); }

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function PhotoEditTool() {
  const { user, token, openAuthModal, refreshUser } = useAuth();
  const modKey = useModKey();
  const job = useJobPolling({ toolSlug: "photo-edit", token });
  const overrides = useModelOverrides();
  const params = useSearchParams();

  const [versions, setVersions] = useState<Version[]>([]);
  const [current, setCurrent] = useState(0);
  const [chainId, setChainId] = useState<string | null>(null);
  const [action, setAction] = useState<PhotoEditAction>("edit");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("auto");
  const [variations, setVariations] = useState(1);
  const [hiRes, setHiRes] = useState(false);
  const [refs, setRefs] = useState<PickerAsset[]>([]);
  const [ratio, setRatio] = useState<ExpandRatio>("9:16");
  const [upscaleFactor, setUpscaleFactor] = useState<2 | 4>(2);
  const [brush, setBrush] = useState(40);
  const [maskPainted, setMaskPainted] = useState(false);
  const [compare, setCompare] = useState(true);
  const [picker, setPicker] = useState<null | "source" | "reference">(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastModel, setLastModel] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const maskRef = useRef<MaskCanvasHandle>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const submittingRef = useRef(false);
  const handledJob = useRef<string | null>(null);
  const pendingParent = useRef<number>(0);

  const working = job.status === "processing";
  const active = versions[current] ?? null;
  const parent = active && active.parent != null ? versions[active.parent] : null;

  const pickableModels = useMemo(() => EDIT_MODELS.filter((m) => overrides[m.id]?.enabled !== false), [overrides]);
  const modelEntry = model === "auto" ? null : getEditModel(model) ?? null;
  const price = quote({ action, model, variations, hiRes, upscaleFactor });
  const canVary = action === "edit" || action === "erase" || action === "expand";
  const maxRefs = modelEntry ? modelEntry.maxImages - 1 : 2;

  // ── Starting a session ────────────────────────────────────────────────────
  const startFrom = useCallback((asset: { id: string; url: string; name: string }) => {
    const id = crypto.randomUUID();
    setVersions([{ key: newKey(), assetId: asset.id, url: asset.url, label: "Original", parent: null }]);
    setCurrent(0);
    setChainId(id);
    setError(null);
    setSuggestions(null);
    job.reset();
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ chainId: id, originalAssetId: asset.id } satisfies StoredSession)); } catch { /* private mode */ }
  }, [job]);

  const fetchAsset = useCallback(async (id: string) => {
    const res = await fetch(`/api/assets/${encodeURIComponent(id)}`, { headers: authHeaders(token) });
    if (!res.ok) return null;
    const data = await res.json() as { asset?: { id: string; url: string; name: string; kind: string } };
    return data.asset?.kind === "image" ? data.asset : null;
  }, [token]);

  // ?asset=<id> (from the Library's "Edit with AI"), else the last session.
  const restored = useRef(false);
  useEffect(() => {
    if (!user || !token || restored.current) return;
    restored.current = true;
    const fromLibrary = params.get("asset");
    void (async () => {
      if (fromLibrary) {
        const a = await fetchAsset(fromLibrary);
        if (a) startFrom(a); else setError("That image isn't in your Assets any more.");
        return;
      }
      let stored: StoredSession | null = null;
      try { stored = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null"); } catch { /* ignore */ }
      if (!stored?.chainId || !stored.originalAssetId) return;
      const [original, hist] = await Promise.all([
        fetchAsset(stored.originalAssetId),
        fetch(`/api/tools/photo-edit/history?chainId=${encodeURIComponent(stored.chainId)}`, { headers: authHeaders(token) })
          .then((r) => (r.ok ? r.json() : { items: [] })) as Promise<{ items: { sourceAssetId: string | null; prompt: string; action: string; model: string | null; images: { url: string; assetId: string | null }[] }[] }>,
      ]);
      if (!original) return;
      const list: Version[] = [{ key: newKey(), assetId: original.id, url: original.url, label: "Original", parent: null }];
      for (const item of hist.items) {
        const from = Math.max(0, list.findIndex((v) => v.assetId === item.sourceAssetId));
        for (const im of item.images) {
          if (im.assetId) list.push({ key: newKey(), assetId: im.assetId, url: im.url, label: item.prompt || item.action, parent: from, model: item.model });
        }
      }
      setVersions(list);
      setCurrent(list.length - 1);
      setChainId(stored.chainId);
    })();
  }, [user, token, params, fetchAsset, startFrom]);

  async function handleUpload(file: File) {
    if (!user) { openAuthModal("login", "AI Photo Editor"); return; }
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { setError("Use a JPG, PNG or WebP image."); return; }
    if (file.size > 20 * 1024 * 1024) { setError("This image is over 20 MB. Use a smaller file."); return; }
    setUploading(true);
    setError(null);
    try {
      const asset = await uploadPickerAsset(file);
      startFrom(asset);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // ── Running an edit ───────────────────────────────────────────────────────
  const canRun = !!active && !working && (
    action === "edit" ? prompt.trim().length > 0
      : action === "erase" ? maskPainted
        : true
  );

  const run = useCallback(async () => {
    if (!user || !token) { openAuthModal("login", "AI Photo Editor"); return; }
    if (!active || !canRun || submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    pendingParent.current = current;
    const mask = action === "erase" ? maskRef.current?.exportMask() : undefined;
    const idempotencyKey = crypto.randomUUID();
    try {
      await job.start(async () => {
        const res = await fetch("/api/tools/photo-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders(token) },
          body: JSON.stringify({
            action,
            assetId: active.assetId,
            prompt: prompt.trim() || undefined,
            model: action === "edit" ? model : undefined,
            referenceAssetIds: action === "edit" ? refs.map((r) => r.id) : undefined,
            mask,
            ratio: action === "expand" ? ratio : undefined,
            upscaleFactor: action === "upscale" ? upscaleFactor : undefined,
            variations: canVary ? variations : 1,
            hiRes: action === "edit" && modelEntry?.hiRes ? hiRes : undefined,
            chainId,
            idempotencyKey,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "The edit didn't start.");
        setLastModel(typeof data.model === "string" ? data.model : null);
        return data as { jobId: string };
      });
    } finally {
      submittingRef.current = false;
    }
  }, [user, token, openAuthModal, active, canRun, current, action, job, prompt, model, refs, ratio, upscaleFactor, canVary, variations, modelEntry, hiRes, chainId]);

  // A finished job adds its image(s) as new versions of the photo it edited.
  useEffect(() => {
    if (job.status !== "done" || !job.jobId || handledJob.current === job.jobId) return;
    handledJob.current = job.jobId;
    const meta = job.meta as { images?: { url: string; assetId: string | null }[]; model?: string } | null;
    const images = (meta?.images ?? []).filter((i): i is { url: string; assetId: string } => !!i.assetId);
    if (!images.length) return;
    const label = action === "edit" ? prompt.trim() : ACTIONS.find(([a]) => a === action)?.[1] ?? action;
    setVersions((prev) => {
      const next = [...prev, ...images.map((im) => ({ key: newKey(), assetId: im.assetId, url: im.url, label, parent: pendingParent.current, model: meta?.model ?? null }))];
      setCurrent(prev.length);
      return next;
    });
    if (action === "erase") maskRef.current?.clear();
    setCompare(true);
    void refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.status, job.jobId, job.meta]);

  async function suggest() {
    if (!active || !token || suggesting) return;
    setSuggesting(true);
    try {
      const res = await fetch("/api/tools/photo-edit/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({ assetId: active.assetId }),
      });
      const data = await res.json() as { suggestions?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error || "No ideas right now.");
      setSuggestions(data.suggestions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No ideas right now.");
    } finally {
      setSuggesting(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void run(); }
  }

  const usedModelName = lastModel ? (getEditModel(lastModel)?.displayName ?? null) : null;
  const runLabel = action === "edit" ? "Edit photo" : action === "erase" ? "Erase" : action === "expand" ? `Expand to ${ratio}` : action === "upscale" ? `Upscale ${upscaleFactor}×` : "Cut out subject";

  // ── Render ────────────────────────────────────────────────────────────────
  const controls = (
    <>
      <ToolField label="Photo">
        {active ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={versions[0].url} alt="Original photo" className="h-14 w-14 rounded-lg border border-line object-cover" />
            <div className="min-w-0 flex-1 text-[12.5px] text-fg-muted">
              {versions.length > 1 ? `${versions.length - 1} edit${versions.length === 2 ? "" : "s"} so far` : "Ready to edit"}
            </div>
            <button type="button" onClick={() => setPicker("source")} className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold text-fg-muted hover:text-fg">New photo</button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <FileDrop accept="image/png,image/jpeg,image/webp" file={null} disabled={uploading} onFile={(f: File) => void handleUpload(f)} title={uploading ? "Uploading…" : "Drop a photo or click to upload"} hint="JPG, PNG or WebP, up to 20 MB" inputLabel="Upload a photo" />
            <button type="button" onClick={() => (user ? setPicker("source") : openAuthModal("login", "AI Photo Editor"))} className="self-start text-[12.5px] font-semibold text-primary hover:underline">
              Or choose from Assets
            </button>
          </div>
        )}
      </ToolField>

      <div className="flex flex-col gap-2">
        <Segmented label="What to do" value={action} options={ACTIONS} onChange={(a) => { setAction(a); setError(null); }} />
        <p className="text-[12px] text-fg-subtle">{ACTION_HINT[action]}</p>
      </div>

      {(action === "edit" || action === "erase" || action === "expand") && (
        <ToolField label={action === "edit" ? "Instruction" : "Instruction (optional)"} hint={<span className="tabular-nums">{prompt.length.toLocaleString()} / 2,000</span>}>
          <textarea
            ref={promptRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKeyDown}
            rows={action === "edit" ? 4 : 2}
            maxLength={2000}
            aria-label="Instruction"
            placeholder={action === "edit" ? "e.g. Change the background to a sunset beach, keep my face the same" : action === "erase" ? "e.g. Replace it with a potted plant (leave empty to remove it)" : "e.g. A busy city street at night"}
            className="w-full resize-none rounded-xl border border-line bg-surface-1 px-3.5 py-3 text-[13.5px] leading-relaxed text-fg outline-none transition placeholder:text-fg-subtle focus:border-primary/60 focus:ring-2 focus:ring-primary/25"
          />
          {action === "edit" && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.label} type="button" onClick={() => { setPrompt(p.prompt); promptRef.current?.focus(); }}
                        className="rounded-full border border-line bg-surface-1 px-2.5 py-1 text-[12px] font-medium text-fg-muted transition-colors hover:border-line-strong hover:text-fg">
                  {p.label}
                </button>
              ))}
              {active && (
                <button type="button" onClick={() => void suggest()} disabled={suggesting}
                        className="rounded-full border border-primary/40 px-2.5 py-1 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50">
                  {suggesting ? "Thinking…" : "Ideas for this photo"}
                </button>
              )}
            </div>
          )}
          {action === "edit" && suggestions && suggestions.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {suggestions.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => { setPrompt(s); setSuggestions(null); }} className="w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-fg-muted hover:bg-surface-2 hover:text-fg">{s}</button>
                </li>
              ))}
            </ul>
          )}
        </ToolField>
      )}

      {action === "edit" && (
        <ToolField label="Model">
          <select value={model} onChange={(e) => { setModel(e.target.value); setHiRes(false); }} aria-label="Model"
                  className="w-full rounded-xl border border-line bg-surface-1 px-3 py-2.5 text-[13.5px] text-fg outline-none focus:border-primary/60">
            <option value="auto">Auto (best fit, {creditLabel(quote({ action: "edit", model: "auto" })!.creditsPerImage)})</option>
            {pickableModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName} ({creditLabel(m.creditCost)}{m.allowedTiers[0] !== "free" ? `, ${m.allowedTiers[0]}+` : ""})
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[12px] text-fg-subtle">{modelEntry ? modelEntry.bestFor : "Auto chooses between Gemini, Qwen, FLUX Kontext and Seedream for each instruction."}</p>
          {modelEntry?.hiRes && (
            <label className="mt-2 flex items-center gap-2 text-[12.5px] text-fg-muted">
              <input type="checkbox" checked={hiRes} onChange={(e) => setHiRes(e.target.checked)} />
              {modelEntry.hiRes.label} output ({creditLabel(modelEntry.hiRes.creditCost)})
            </label>
          )}
        </ToolField>
      )}

      {action === "edit" && (
        <ToolField label="Reference images (optional)" hint={`${refs.length} / ${Math.max(0, maxRefs)}`}>
          <div className="flex flex-wrap items-center gap-2">
            {refs.map((r) => (
              <div key={r.id} className="relative h-12 w-12">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.thumbnailUrl ?? r.url} alt={r.name} className="h-full w-full rounded-lg border border-line object-cover" />
                <button type="button" aria-label={`Remove ${r.name}`} onClick={() => setRefs(refs.filter((x) => x.id !== r.id))}
                        className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-[10px] text-white">×</button>
              </div>
            ))}
            {refs.length < maxRefs && (
              <button type="button" onClick={() => setPicker("reference")} aria-label="Add a reference image"
                      className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-dashed border-line-strong text-lg text-fg-subtle hover:text-fg-muted">+</button>
            )}
          </div>
          <p className="mt-1.5 text-[12px] text-fg-subtle">For example a product to place in the photo, or a style to copy.</p>
        </ToolField>
      )}

      {action === "erase" && (
        <ToolField label="Brush size" hint={`${brush}px`}>
          <input type="range" min={8} max={120} value={brush} onChange={(e) => setBrush(Number(e.target.value))} aria-label="Brush size" className="w-full accent-[var(--primary)]" />
        </ToolField>
      )}

      {action === "expand" && (
        <ToolField label="New shape">
          <Segmented label="New shape" value={ratio} options={EXPAND_RATIOS.map((r) => [r, r] as const)} onChange={setRatio} />
        </ToolField>
      )}

      {action === "upscale" && (
        <ToolField label="Size">
          <Segmented label="Upscale factor" value={String(upscaleFactor) as "2" | "4"} options={[["2", "2×"], ["4", "4×"]] as const} onChange={(v) => setUpscaleFactor(v === "4" ? 4 : 2)} />
        </ToolField>
      )}

      {canVary && (
        <ToolField label="Variations">
          <Segmented label="Variations" value={String(variations) as "1" | "2" | "3" | "4"}
                     options={Array.from({ length: MAX_VARIATIONS }, (_, i) => [String(i + 1), String(i + 1)] as const) as readonly (readonly ["1" | "2" | "3" | "4", string])[]}
                     onChange={(v) => setVariations(Number(v))} />
        </ToolField>
      )}
    </>
  );

  const footer = (
    <>
      {error && <p role="alert" className="text-[12px] text-error">{error}</p>}
      {job.status === "error" && job.error && <p role="alert" className="text-[12px] text-error">{job.error}</p>}
      {job.status === "cancelled" && <p className="text-[12px] text-fg-subtle">Cancelled. Your credits were refunded.</p>}
      <CostRow right={user ? `You have ${user.credits.toLocaleString()}` : undefined}>
        {price ? <span className="font-semibold text-fg">{creditLabel(price.credits)}</span> : null}
        {price && price.images > 1 ? <span className="text-fg-subtle"> · {price.images} images</span> : null}
      </CostRow>
      <Button type="button" className="w-full" onClick={() => void run()} disabled={!canRun} loading={working}>
        {working ? "Working…" : <>{runLabel} {action === "edit" && <kbd className="ml-1 hidden rounded bg-black/15 px-1.5 py-0.5 text-[11px] font-semibold sm:inline-block">{modKey}+Enter</kbd>}</>}
      </Button>
      {!user && <p className="text-center text-[12px] text-fg-subtle">You&apos;ll be asked to sign in to edit.</p>}
      {user && <p className="text-center text-[11.5px] text-fg-subtle">Free plan: up to {FREE_DAILY_EDITS} edits a day. Every result is saved to your Assets.</p>}
    </>
  );

  const stage = working ? (
    <StageProgress label={action === "edit" ? `Editing${usedModelName ? ` with ${usedModelName}` : ""}…` : "Working on your photo…"} progress={job.progress} onCancel={() => void job.cancel()} cancelLabel="Cancel and refund" />
  ) : !active ? (
    <StageEmpty icon="image" title="Your photo appears here">
      Upload a photo or pick one from Assets, then type what you want changed.
    </StageEmpty>
  ) : action === "erase" ? (
    <MaskCanvas ref={maskRef} src={active.url} brush={brush} onPaintedChange={setMaskPainted} />
  ) : parent && compare ? (
    <BeforeAfter before={parent.url} after={active.url} alt={active.label} />
  ) : (
    <div className="flex items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={active.url} alt={active.label} className="max-h-[620px] w-full object-contain" />
    </div>
  );

  const stageActions = active && !working ? (
    <div className="flex flex-wrap items-center gap-2">
      {parent && action !== "erase" && (
        <Button type="button" size="sm" variant="secondary" onClick={() => setCompare((c) => !c)}>{compare ? "Hide compare" : "Compare"}</Button>
      )}
      <Button type="button" size="sm" variant="secondary" onClick={() => downloadFile(active.url, `${active.label.slice(0, 40).replace(/[^\w -]/g, "").trim() || "photo"}.png`)}>Download</Button>
      <Link href={`/dashboard/assets/${active.assetId}`} className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-semibold text-fg-muted hover:text-fg">Open in Assets</Link>
    </div>
  ) : undefined;

  const below = versions.length > 1 ? (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Versions · the next edit applies to the selected one</p>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {versions.map((v, i) => (
          <button key={v.key} type="button" onClick={() => setCurrent(i)} title={v.label} aria-pressed={i === current}
                  className={`relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${i === current ? "border-primary" : "border-line hover:border-line-strong"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={v.url} alt={v.label} className="h-full w-full object-cover" />
            <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[10px] font-semibold text-white">{i === 0 ? "Original" : `v${i}`}</span>
          </button>
        ))}
      </div>
    </div>
  ) : undefined;

  return (
    <>
      <AssetPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        accept={["image"]}
        title={picker === "reference" ? "Choose a reference image" : "Choose a photo to edit"}
        onSelect={(a) => {
          if (picker === "reference") { if (!refs.some((r) => r.id === a.id) && a.id !== active?.assetId) setRefs([...refs, a]); }
          else startFrom(a);
          setPicker(null);
        }}
      />
      <ToolWorkspace
        title="AI Photo Editor"
        icon="image"
        badges={<ToolBadge>From 1 credit</ToolBadge>}
        description="Upload a photo and type what to change."
        controls={controls}
        footer={footer}
        stageTitle={active ? (current === 0 ? "Original" : `Version ${current}`) : "Result"}
        stageActions={stageActions}
        stage={stage}
        below={below}
        stageFirstOnMobile
      />
    </>
  );
}
