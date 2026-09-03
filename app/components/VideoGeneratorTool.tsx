"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { useJobPolling } from "./useJobPolling";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { VIDEO_MODELS, DEFAULT_VIDEO_MODEL_ID, getVideoModel, videoCreditsPerSecond } from "@/lib/models/videoModels";
import type { VideoModelEntry, VideoParam } from "@/lib/models/types";
import { maxDurationForTier } from "@/lib/plans/tiers";
import { Switch } from "@/app/components/ui/Switch";
import { AssetPicker } from "@/app/components/assets/AssetPicker";
import type { PickerAsset } from "@/app/components/assets/assetPickerData";
import { useUploadEntitlement } from "@/app/hooks/useUploadEntitlement";

// ── Options ────────────────────────────────────────────────────────────────────
const RATIOS    = ["16:9", "9:16", "1:1"];
const RESOLUTIONS = ["480p", "720p", "1080p"];
const FPS_OPTIONS = ["16", "24", "30"];

// Length shown to logged-out visitors (highest tier's cap) — they can't be
// billed until they sign in, so show each model's full capability.
const ANON_DURATION_CAP = 15;

// Curated duration choices in seconds, clamped to [min, max]. Both endpoints are
// always included so every model exposes its real maximum length.
function durationChoices(min: number, max: number): number[] {
  const base = [2, 3, 4, 5, 6, 8, 10, 12, 15];
  const set = new Set<number>([min, max]);
  for (const s of base) if (s >= min && s <= max) set.add(s);
  return [...set].filter(s => s >= min && s <= max).sort((a, b) => a - b);
}

// Billed seconds for a model given a requested length and the plan-tier cap —
// mirrors the route's clamp: max(modelMin, min(requested, min(modelMax, tierCap))).
function billedSeconds(model: VideoModelEntry, requested: number, tierCap: number): number {
  const effMax = Math.min(model.maxDurationSeconds, tierCap);
  return Math.min(Math.max(requested, model.minDurationSeconds), effMax);
}

// Credits = ceil(effectiveCreditsPerSecond * billedSeconds), exactly as the route
// charges. Resolution + audio feed the same shared helper the route uses.
function creditsFor(
  model: VideoModelEntry,
  requested: number,
  tierCap: number,
  opts?: { resolution?: string; audio?: boolean },
): number {
  return Math.ceil(videoCreditsPerSecond(model, opts) * billedSeconds(model, requested, tierCap));
}

type PromptEntry = { id: string; category: string; label: string; text: string; gradient: string };

// Prompt ids that have a matching sample clip in public/prompt-library/<id>.mp4.
// Everything except i4 ("News desk") ships a clip; ids not listed fall back to
// their gradient placeholder.
const PROMPTS_WITH_VIDEO = new Set([
  "a1","a2","a3","a4","a5",
  "c1","c2","c3","c4","c5",
  "i1","i2","i3","i5",
  "v1","v2","v3","v4","v5",
  "o1","o2","o3","o4","o5",
]);
const promptVideoSrc = (id: string): string | null =>
  PROMPTS_WITH_VIDEO.has(id) ? `/prompt-library/${id}.mp4` : null;

const LIBRARY_PROMPTS: PromptEntry[] = [
  // ASMR
  { id:"a1", category:"asmr", label:"Mic whisper",      gradient:"linear-gradient(135deg,#f9a8d4,#fb7185)", text:"Realistic 4K portrait shot, camera locked in a tight chest-up frame of a blonde woman in a pastel-pink knit sweater, leaning into a matte-black condenser microphone. Behind her, golden fairy-light bokeh and a glowing Himalayan salt lamp cast a warm, cozy hue over a dim bedroom studio. She alternates breathy ear-to-ear whispers and soft lip taps, fingertips fluttering beside the mic in a slow, hypnotic rhythm. Every murmur, subtle hand movement and ambient twinkle is captured for a soothing ASMR soundscape." },
  { id:"a2", category:"asmr", label:"Tapping wood",     gradient:"linear-gradient(135deg,#fda4af,#f472b6)", text:"Close-up slow-motion shot of elegant female fingers tapping rhythmically on a polished oak table surface in a softly lit room. The camera glides between macro views of knuckles, nails and grain patterns. Warm amber lighting creates a meditative atmosphere with gentle wooden percussion for a deep ASMR tapping experience." },
  { id:"a3", category:"asmr", label:"Rain on glass",    gradient:"linear-gradient(135deg,#a78bfa,#818cf8)", text:"Cinematic close-up of raindrops trailing down a foggy window pane, golden streetlights blurring softly behind the glass. A cozy candle flickers in the foreground. The camera slowly drifts across the droplet patterns while ambient rain and the faint crackle of a fireplace create a deeply relaxing ASMR atmosphere." },
  { id:"a4", category:"asmr", label:"Book pages",       gradient:"linear-gradient(135deg,#6ee7b7,#34d399)", text:"An extreme close-up of weathered book pages being slowly turned one by one under warm desk lamp light. The camera captures every paper fiber, slight warp and soft whoosh of each page flip. Ancient leather binding and faint ink scent implied by warm tones. A deeply meditative ASMR reading atmosphere." },
  { id:"a5", category:"asmr", label:"Sand art",         gradient:"linear-gradient(135deg,#fcd34d,#f59e0b)", text:"Macro overhead shot of fine white sand being slowly poured and sculpted by gentle fingertips on a light box. Patterns form and dissolve in flowing motions. Soft crunching sounds of shifting grains and the hypnotic visual texture make this a soothing sand ASMR session in 4K." },
  // Car
  { id:"c1", category:"car",  label:"Mountain chase",   gradient:"linear-gradient(135deg,#334155,#475569)", text:"Cinematic car chase through winding mountain roads at dusk. A matte-black sports car hugs tight hairpin turns, tires screeching, exhaust flames visible. Drone camera sweeps wide to reveal dramatic valley below as headlights cut through gathering fog. Slow-motion tire spray and gravel scatter in golden hour light." },
  { id:"c2", category:"car",  label:"Classic reveal",   gradient:"linear-gradient(135deg,#1e3a5f,#2563eb)", text:"A pristine 1969 Mustang Fastback sitting in a dark showroom. Spotlights slowly illuminate the car from front to back, revealing its curves in dramatic fashion. The camera circles the vehicle at low angle, chrome gleaming, as dry ice fog rolls across the floor. Cinematic reveal shot with dramatic orchestral build." },
  { id:"c3", category:"car",  label:"Night city drive", gradient:"linear-gradient(135deg,#0f172a,#1e293b)", text:"First-person POV night drive through a neon-lit city. Rain-slicked streets reflect thousands of colourful signs, the dashboard glowing softly as the driver navigates empty boulevards. Bokeh street lights trail past the windows. A cinematic lo-fi late-night driving mood captured in 4K 24fps." },
  { id:"c4", category:"car",  label:"Track day",        gradient:"linear-gradient(135deg,#dc2626,#b91c1c)", text:"High-speed tracking shot of a GT3 race car lapping a sun-drenched circuit. The camera follows at bumper height then cuts to an interior GoPro as the driver brakes hard into a chicane. Tire smoke, rev limiter hits and perfect late-apex exits. Captured with 180fps slow-motion replays of key overtakes." },
  { id:"c5", category:"car",  label:"Desert road",      gradient:"linear-gradient(135deg,#d97706,#b45309)", text:"A lone vintage convertible travelling down an endless desert highway at magic hour. Aerial drone pulls back slowly to reveal infinite red rock canyons stretching to the horizon. The driver's hand trails in the warm wind, radio crackling faintly. Saturated, cinematic road-trip video with golden dust haze." },
  // Interview
  { id:"i1", category:"interview", label:"CEO boardroom", gradient:"linear-gradient(135deg,#1e40af,#1d4ed8)", text:"Professional interview setup in a modern glass-walled boardroom overlooking a city skyline. A confident CEO in a tailored navy suit speaks directly to camera with calm authority. Shallow depth of field blurs city lights behind. Two-camera documentary edit with subtle rack focus. Corporate cinematic grade." },
  { id:"i2", category:"interview", label:"Podcast studio", gradient:"linear-gradient(135deg,#7c3aed,#6d28d9)", text:"Intimate podcast studio with warm Edison bulbs, acoustic panels and two hosts leaning in across a circular table. Professional condenser mics in foreground. The camera alternates between wide two-shot and tight singles. Genuine laughter and animated hand gestures. Documentary-style cut with ambient room tone." },
  { id:"i3", category:"interview", label:"Street interview",gradient:"linear-gradient(135deg,#065f46,#047857)", text:"Handheld street interview on a busy urban sidewalk. The interviewer holds a branded mic toward a diverse range of passersby who give spontaneous, expressive reactions. Dynamic editing between subjects with natural city ambience. Authentic documentary feel with shallow focus and organic camera movement." },
  { id:"i4", category:"interview", label:"News desk",      gradient:"linear-gradient(135deg,#1e3a5f,#0369a1)", text:"A sharp-suited news anchor sits behind an illuminated broadcast desk against a live studio monitor showing breaking news graphics. Camera slowly pushes in as the anchor delivers breaking news to camera. Studio lighting is crisp and cool. Control room monitors visible in background. High-budget broadcast aesthetic." },
  { id:"i5", category:"interview", label:"Doc close-up",   gradient:"linear-gradient(135deg,#374151,#4b5563)", text:"Tight documentary-style close-up interview of a weathered face showing wisdom and emotion. Natural window light from the left creates dramatic side-light. Subject pauses thoughtfully mid-sentence, eyes glistening. No music, just room ambience. The raw, unguarded moment feels deeply human and cinematic." },
  // Vlog
  { id:"v1", category:"vlog",     label:"Travel aerial",  gradient:"linear-gradient(135deg,#0284c7,#0ea5e9)", text:"Sweeping aerial travel vlog opener over a turquoise Mediterranean coastline. A drone slowly rises above terracotta rooftops to reveal crystal-clear water and white sand beaches below. The vlogger appears at the edge of a cliffside viewpoint, arms spread wide, golden hour glow. Upbeat cinematic travel grade." },
  { id:"v2", category:"vlog",     label:"Food kitchen",   gradient:"linear-gradient(135deg,#ea580c,#f97316)", text:"Energetic food vlog in a home kitchen with bright natural light. The creator chops, stirs and plates a colourful dish while narrating directly to a mounted camera. Steam rising, sauce bubbling and vibrant vegetable colours fill the frame. Quick cuts, enthusiastic personality and beautiful close-ups of food textures." },
  { id:"v3", category:"vlog",     label:"Morning routine", gradient:"linear-gradient(135deg,#f59e0b,#fbbf24)", text:"Aesthetic morning routine vlog from 6AM sunrise. Time-lapse of golden light filling a minimal apartment as the creator wakes, makes pour-over coffee, journals and heads out for a run. Warm film grain, soft focus and calm lo-fi energy. Aspirational yet authentic daily lifestyle content." },
  { id:"v4", category:"vlog",     label:"City walk",       gradient:"linear-gradient(135deg,#0f766e,#0d9488)", text:"Day-in-the-life city walk vlog through Tokyo streets. Handheld camera captures street food stalls, convenience store hauls, shrine visits and neon-lit evening alleyways. Fast-paced jump cuts between locations with upbeat J-pop instrumental. Authentic urban exploration with genuine reactions and local interactions." },
  { id:"v5", category:"vlog",     label:"Sunset beach",    gradient:"linear-gradient(135deg,#be185d,#db2777)", text:"Slow, golden sunset beach vlog. The creator walks barefoot along the shoreline as the sky turns shades of orange, pink and purple. Drone footage of waves gently lapping the sand transitions to handheld silhouette shots. Reflective voiceover, acoustic guitar background music. Peaceful, emotional end-of-day content." },
  // Other
  { id:"o1", category:"other",    label:"Stormtrooper",   gradient:"linear-gradient(135deg,#1e293b,#334155)", text:"Two Stormtroopers in pristine white armour patrol a sleek sci-fi corridor with blinking control panels and humming energy conduits. Camera tracks alongside at eye level before cutting to a dramatic low-angle reverse as blast doors slide open behind them. Cinematic Star Wars aesthetic with practicals and lens flares." },
  { id:"o2", category:"other",    label:"Magic forest",   gradient:"linear-gradient(135deg,#14532d,#15803d)", text:"An enchanted forest at twilight where glowing fireflies spiral around ancient moss-covered trees. A narrow stone path leads deeper as bioluminescent flowers pulse softly. Slow camera drift through hanging vines. Fairy-tale fantasy atmosphere with volumetric mist and ethereal choral music implied by the visuals." },
  { id:"o3", category:"other",    label:"Space station",  gradient:"linear-gradient(135deg,#0f172a,#1e1b4b)", text:"Cinematic exterior shot of a massive space station in low Earth orbit. The ISS-style structure rotates slowly against the blue curvature of the Earth, sun glinting off solar panels. Camera slowly pushes in as an airlock hatch opens and an astronaut in a white EVA suit emerges. Silent, awe-inspiring space cinematography." },
  { id:"o4", category:"other",    label:"Abstract art",   gradient:"linear-gradient(135deg,#7c3aed,#a855f7)", text:"Macro close-up of liquid paint being dropped into water in slow motion. Vibrant purples, golds and blues collide and bloom into infinite fractal shapes. The camera rotates around the explosion of colour as it unfolds. Shot at 1000fps to reveal detail invisible to the naked eye. Hypnotic abstract visual art." },
  { id:"o5", category:"other",    label:"Ancient temple", gradient:"linear-gradient(135deg,#92400e,#b45309)", text:"A lone explorer with a torch enters a long-forgotten jungle temple at dawn. Stone carvings and golden artifacts catch the torchlight. The camera tracks over carved reliefs as shafts of morning light pierce through cracks in the ceiling. Indiana Jones-style adventure cinematography with atmospheric dust and dramatic shadows." },
];

const PROMPT_TIPS = [
  "Start with the camera movement (aerial shot, close-up, timelapse…)",
  "Describe the subject, setting, and mood in detail",
  "Mention lighting style (golden hour, neon, dramatic, soft)",
  "Add a quality tag at the end (4K, cinematic, photorealistic)",
  "Keep prompts under 200 words for best results",
];

// ── Icons ─────────────────────────────────────────────────────────────────────
function IcChevron() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 flex-shrink-0"><path d="M6 9l6 6 6-6"/></svg>;
}
function IcCheck() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M20 6L9 17l-5-5"/></svg>;
}
function IcBook() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>;
}
function IcFileText() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>;
}
function IcImage() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>;
}
function IcX() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M18 6L6 18M6 6l12 12"/></svg>;
}
function IcDownload() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>;
}
function IcInfo() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>;
}
function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>;
}

// ── Generic dropdown ──────────────────────────────────────────────────────────
function Dropdown<T extends { slug?: string; label?: string; name?: string; badge?: string | null }>({
  label,
  value,
  options,
  getSlug,
  getLabel,
  getBadge,
  getSubtext,
  searchable,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly T[];
  getSlug: (o: T) => string;
  getLabel: (o: T) => string;
  getBadge?: (o: T) => string | null | undefined;
  getSubtext?: (o: T) => string | null | undefined;
  searchable?: boolean;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => getSlug(o) === value) ?? options[0];
  const filtered = searchable && search.trim()
    ? options.filter(o =>
        getLabel(o).toLowerCase().includes(search.toLowerCase()) ||
        (getSubtext?.(o) ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : options;

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(""); } }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-gray-500 mb-1.5">{label}</p>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(o => { if (o) setSearch(""); return !o; })}
          className="flex items-center gap-2 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[13px] font-medium text-gray-900 hover:border-gray-300 transition-colors"
        >
          <span className="flex-1 text-left truncate">{getLabel(selected)}</span>
          {getBadge && getBadge(selected) && (
            <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 rounded-md px-1.5 py-0.5 flex-shrink-0">
              {getBadge(selected)}
            </span>
          )}
          <IcChevron />
        </button>
        {open && (
          <div className="absolute top-full mt-1 left-0 w-full z-30 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
            {searchable && (
              <div className="p-2 border-b border-gray-100">
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search models..."
                  className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400"
                  onClick={e => e.stopPropagation()}
                />
              </div>
            )}
            <div className="max-h-72 overflow-y-auto">
              {filtered.map(opt => {
                const slug = getSlug(opt);
                const badge = getBadge?.(opt);
                return (
                  <button
                    key={slug}
                    onClick={() => { onChange(slug); setOpen(false); setSearch(""); }}
                    className="flex items-center gap-2 w-full px-3.5 py-2.5 text-[13px] text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className={`flex-shrink-0 w-3.5 ${value === slug ? "text-blue-600" : "text-transparent"}`}>
                      <IcCheck />
                    </span>
                    <span className="flex-1 font-medium text-gray-900 truncate">{getLabel(opt)}</span>
                    {badge && (
                      <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 rounded-md px-1.5 py-0.5 flex-shrink-0">
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p className="px-3.5 py-3 text-[12.5px] text-gray-400 text-center">No models found</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Prompt Library Modal ──────────────────────────────────────────────────────
const CATEGORIES = [
  { slug: "all",       label: "All",       count: 25 },
  { slug: "asmr",      label: "Asmr",      count: 5  },
  { slug: "car",       label: "Car",        count: 5  },
  { slug: "interview", label: "Interview",  count: 5  },
  { slug: "vlog",      label: "Vlog",       count: 5  },
  { slug: "other",     label: "Other",      count: 5  },
];

function IcPlay() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-white drop-shadow-lg">
      <path d="M8 5.14v14l11-7-11-7z"/>
    </svg>
  );
}

function IcArrowRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
  );
}

function PromptLibraryModal({ onSelect, onClose }: { onSelect: (text: string) => void; onClose: () => void }) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedId, setSelectedId] = useState(LIBRARY_PROMPTS[0].id);

  const filtered = activeCategory === "all"
    ? LIBRARY_PROMPTS
    : LIBRARY_PROMPTS.filter(p => p.category === activeCategory);

  const selected = LIBRARY_PROMPTS.find(p => p.id === selectedId) ?? filtered[0];

  useEffect(() => {
    if (!filtered.find(p => p.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? "");
    }
  }, [activeCategory, filtered, selectedId]);

  useEffect(() => {
    function h(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden"
        style={{ maxWidth: 860, height: "min(540px, 90vh)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <IcBook />
            <h2 className="text-base font-bold text-gray-900">Prompt Library</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 flex-shrink-0 overflow-x-auto scrollbar-hide">
          {CATEGORIES.map(cat => (
            <button
              key={cat.slug}
              onClick={() => setActiveCategory(cat.slug)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                activeCategory === cat.slug
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {cat.label} ({cat.count})
            </button>
          ))}
        </div>

        {/* Body: thumbnails | prompt text | video — stacked on mobile, three columns from md up */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-y-auto">

          {/* Col 1: thumbnail list */}
          <div className="w-full md:w-44 md:flex-shrink-0 max-h-40 md:max-h-none overflow-y-auto border-b md:border-b-0 md:border-r border-gray-100 py-2">
            {filtered.map(p => {
              const src = promptVideoSrc(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full p-1.5 transition-colors ${selectedId === p.id ? "bg-blue-50" : "hover:bg-gray-50"}`}
                >
                  <div
                    className={`relative w-full rounded-lg overflow-hidden border-2 transition-colors ${
                      selectedId === p.id ? "border-blue-500" : "border-transparent"
                    }`}
                    style={{ aspectRatio: "16/9", background: p.gradient }}
                  >
                    {src ? (
                      <video
                        src={src}
                        muted
                        loop
                        autoPlay
                        playsInline
                        preload="metadata"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <IcPlay />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {selected && (
            <>
              {/* Col 2: video preview */}
              <div className="flex-1 flex flex-col justify-center p-4 border-b md:border-b-0 md:border-r border-gray-100 min-w-0">
                <div
                  className="w-full rounded-xl overflow-hidden relative flex items-center justify-center"
                  style={{ aspectRatio: "16/9", background: selected.gradient }}
                >
                  {promptVideoSrc(selected.id) ? (
                    <video
                      key={selected.id}
                      src={promptVideoSrc(selected.id)!}
                      controls
                      muted
                      loop
                      autoPlay
                      playsInline
                      preload="metadata"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-black/30 flex items-center justify-center">
                          <IcPlay />
                        </div>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/40 px-3 py-1.5 flex items-center gap-2">
                        <svg viewBox="0 0 24 24" fill="white" className="w-3 h-3 flex-shrink-0"><path d="M8 5v14l11-7z"/></svg>
                        <span className="text-white text-[10px] font-mono">0:00 / 0:08</span>
                        <div className="flex-1 h-0.5 bg-white/30 rounded mx-1"><div className="h-full w-0 bg-white rounded"/></div>
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-3 h-3 flex-shrink-0"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 010 14.14"/></svg>
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-3 h-3 flex-shrink-0"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-3 h-3 flex-shrink-0"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Col 3: prompt text + button */}
              <div className="w-full md:w-72 md:flex-shrink-0 flex flex-col p-5 gap-4">
                <div className="flex-1 overflow-y-auto min-h-0">
                  <p className="text-[13px] text-gray-700 leading-relaxed">{selected.text}</p>
                </div>
                <div className="flex justify-end flex-shrink-0">
                  <button
                    onClick={() => { onSelect(selected.text); onClose(); }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ background: "linear-gradient(135deg, #335CFF 0%, #7B5EA7 100%)" }}
                  >
                    Use the Prompt <IcArrowRight />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Prompt Docs Popover ───────────────────────────────────────────────────────
function PromptDocsPopover({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function h(e: MouseEvent) { void e; onClose(); }
    setTimeout(() => document.addEventListener("mousedown", h), 0);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <div className="absolute top-full mt-2 left-0 z-30 bg-white rounded-xl border border-gray-200 shadow-lg p-4 w-72" onClick={e => e.stopPropagation()}>
      <p className="text-xs font-bold text-gray-800 mb-2.5 flex items-center gap-1.5"><IcInfo /> Prompt Writing Tips</p>
      <ul className="space-y-1.5">
        {PROMPT_TIPS.map((tip, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-500 leading-relaxed">
            <span className="text-blue-400 mt-0.5 flex-shrink-0">•</span>{tip}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Main tool ─────────────────────────────────────────────────────────────────

export default function VideoGeneratorTool() {
  const { user, token, openAuthModal, refreshUser } = useAuth();
  const { maxBytes: refImageMaxBytes, formattedMaxSize: refImageMaxSizeLabel } = useUploadEntitlement("reference-image");
  const job = useJobPolling({ toolSlug: "video-generator", token });
  const fireReviewPrompt = useReviewPromptTrigger();
  const submittingRef = useRef(false);
  const downloadedForJobId = useRef<string | null>(null);

  const [model,       setModel]       = useState(DEFAULT_VIDEO_MODEL_ID);
  const [duration,    setDuration]    = useState("8s");
  const [ratio,       setRatio]       = useState("16:9");
  const [resolution,  setResolution]  = useState("720p");
  const [audio,       setAudio]       = useState(true);
  const [fps,         setFps]         = useState("24");
  const [seed,        setSeed]        = useState("");
  const [prompt,      setPrompt]      = useState("");
  const [videoUrl,    setVideoUrl]    = useState<string | null>(null);
  const [downloadName,setDownloadName]= useState("ai-video.mp4");
  const [showLibrary, setShowLibrary] = useState(false);
  const [showDocs,    setShowDocs]    = useState(false);
  const [refImage,    setRefImage]    = useState<File | null>(null);
  // A reference image reused from the Asset Library — already hosted, so
  // generation uses its URL directly instead of uploading refImage first.
  // Mutually exclusive with refImage.
  const [refImageAsset, setRefImageAsset] = useState<PickerAsset | null>(null);
  const [refPickerOpen, setRefPickerOpen] = useState(false);
  const [uploadingRef,setUploadingRef]= useState(false);
  const [pickError,   setPickError]   = useState<string | null>(null);

  const fileInputRef  = useRef<HTMLInputElement>(null);
  const textareaRef   = useRef<HTMLTextAreaElement>(null);

  const modelEntry = getVideoModel(model);
  const supports = (p: VideoParam) => modelEntry.supportedParameters.includes(p);
  const needsImage = modelEntry.imageInput === "required" && !refImage && !refImageAsset;

  // Max clip length is the smaller of the model's provider ceiling and the
  // user's plan-tier cap (Creator 5s / Pro 10s / Studio 15s). The seconds shown
  // are exactly what the route bills, so the credit figures never surprise the user.
  const durationCap = user ? maxDurationForTier(user.tier) : ANON_DURATION_CAP;
  const requestedSeconds = parseInt(duration) || modelEntry.maxDurationSeconds;
  const effectiveSeconds = billedSeconds(modelEntry, requestedSeconds, durationCap);
  // Pricing inputs that vary the per-second rate: resolution (tiered models) and
  // audio (Veo 3). Passed to creditsFor so badge + button always match the route.
  const priceOpts = {
    resolution: supports("resolution") ? resolution : undefined,
    audio: modelEntry.supportsAudio ? audio : undefined,
  };
  const currentCredits = creditsFor(modelEntry, requestedSeconds, durationCap, priceOpts);
  const currentRate = videoCreditsPerSecond(modelEntry, priceOpts);
  const durationSecondsList = durationChoices(
    modelEntry.minDurationSeconds,
    Math.min(modelEntry.maxDurationSeconds, durationCap),
  );
  // The dropdown is driven by the clamped value (not the raw pick) so switching
  // to a shorter-max model, or a Creator landing on a Studio-only length, snaps
  // the displayed selection into range without a state-syncing effect.
  const durationValue = `${effectiveSeconds}s`;

  const handleGenerate = useCallback(async () => {
    if (!user || !token) { openAuthModal("login", "AI Video Generator"); return; }
    if (!prompt.trim() || job.status === "processing" || needsImage) return;
    if (submittingRef.current) return;
    submittingRef.current = true;

    if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(null); }
    const idempotencyKey = crypto.randomUUID();

    try {
      await job.start(async () => {
        let referenceImageUrl: string | undefined;
        if (refImageAsset) {
          referenceImageUrl = refImageAsset.url;
        } else if (refImage) {
          setUploadingRef(true);
          try {
            const fd = new FormData();
            fd.append("image", refImage);
            const upRes = await fetch("/api/tools/upload-reference-image", {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              body: fd,
            });
            const upData = await upRes.json();
            if (!upRes.ok) throw new Error(upData.error ?? "Reference image upload failed");
            referenceImageUrl = upData.url;
          } finally {
            setUploadingRef(false);
          }
        }

        const body: Record<string, unknown> = {
          prompt: prompt.trim(),
          model,
          duration: effectiveSeconds,
          aspectRatio: ratio,
          resolution: supports("resolution") ? resolution : undefined,
          audio: modelEntry.supportsAudio ? audio : undefined,
          fps: supports("fps") ? Number(fps) : undefined,
          seed: supports("seed") && seed.trim() ? Number(seed) : undefined,
          referenceImageUrl,
          idempotencyKey,
        };

        const res = await fetch("/api/tools/video-generator", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Error ${res.status}`);
        }
        return (await res.json()) as { jobId: string };
      });
    } finally {
      submittingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, token, openAuthModal, prompt, needsImage, videoUrl, refImage, refImageAsset, model, duration, ratio, resolution, audio, fps, seed, job]);

  // Once the job is done, fetch the result and trigger a download.
  useEffect(() => {
    if (job.status !== "done" || !job.jobId || !token) return;
    if (downloadedForJobId.current === job.jobId) return;
    downloadedForJobId.current = job.jobId;
    fireReviewPrompt("tool_generation_complete", { featureHint: "ai_tools" }).catch(() => { /* non-critical */ });

    (async () => {
      try {
        const name = `ai-video-${Date.now()}.mp4`;
        setDownloadName(name);
        const dlRes = await fetch(`/api/tools/video-generator?jobId=${job.jobId}&download=1`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!dlRes.ok) throw new Error("Download failed");
        const blob = await dlRes.blob();
        const url = URL.createObjectURL(blob);
        setVideoUrl(url);

        const a = document.createElement("a");
        a.href = url; a.download = name; a.click();

        await refreshUser();
      } catch {
        // The job itself succeeded; a failed download fetch just means the
        // user has to use "Download" again — no need to flip to an error state.
      }
    })();
  }, [job.status, job.jobId, token, refreshUser, fireReviewPrompt]);

  // Revoke the held video object URL on unmount.
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcut
  useEffect(() => {
    function h(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && job.status === "idle" && prompt.trim() && !needsImage) {
        e.preventDefault();
        void handleGenerate();
      }
    }
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [job.status, prompt, needsImage, handleGenerate]);

  const handleReset = () => {
    job.reset();
    if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(null); }
  };

  const durationOptions   = durationSecondsList.map(s => ({ slug: `${s}s`, name: `${s}s` }));
  const ratioOptions      = RATIOS.map(r => ({ slug: r, name: r }));
  const resolutionOptions = RESOLUTIONS.map(r => ({ slug: r, name: r }));
  const fpsOptions        = FPS_OPTIONS.map(f => ({ slug: f, name: `${f} fps` }));

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Video Generator</h1>
          <p className="text-sm text-gray-500 mt-1">Generate stunning videos from text with AI</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-visible">
          <div className="p-6 space-y-5">

            {/* Dropdowns row */}
            <div className="flex gap-3 flex-wrap">
              <Dropdown
                label="Model"
                value={model}
                options={VIDEO_MODELS}
                getSlug={o => o.id}
                getLabel={o => o.displayName}
                getBadge={o => `${creditsFor(o, requestedSeconds, durationCap, { resolution: o.resolutionCredits ? resolution : undefined, audio: o.supportsAudio ? audio : undefined })} credits`}
                getSubtext={o => o.provider}
                searchable
                onChange={setModel}
              />
              {supports("duration") && (
                <Dropdown
                  label="Duration"
                  value={durationValue}
                  options={durationOptions}
                  getSlug={o => o.slug}
                  getLabel={o => o.name}
                  onChange={setDuration}
                />
              )}
              {supports("aspectRatio") && (
                <Dropdown
                  label="Aspect Ratio"
                  value={ratio}
                  options={ratioOptions}
                  getSlug={o => o.slug}
                  getLabel={o => o.name}
                  onChange={setRatio}
                />
              )}
              {supports("resolution") && (
                <Dropdown
                  label="Resolution"
                  value={resolution}
                  options={resolutionOptions}
                  getSlug={o => o.slug}
                  getLabel={o => o.name}
                  onChange={setResolution}
                />
              )}
              {supports("fps") && (
                <Dropdown
                  label="FPS"
                  value={fps}
                  options={fpsOptions}
                  getSlug={o => o.slug}
                  getLabel={o => o.name}
                  onChange={setFps}
                />
              )}
            </div>
            {modelEntry.supportsAudio && (
              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3.5 py-2.5">
                <div>
                  <p className="text-[13px] font-semibold text-gray-900">Audio</p>
                  <p className="text-[11px] text-gray-400">
                    {audio ? "Generated with sound" : "Silent video (cheaper)"} · {currentRate} credits/sec
                  </p>
                </div>
                <Switch checked={audio} onChange={setAudio} label="Generate audio" />
              </div>
            )}
            {supports("seed") && (
              <div className="w-32">
                <p className="text-xs font-semibold text-gray-500 mb-1.5">Seed</p>
                <input
                  type="number"
                  value={seed}
                  onChange={e => setSeed(e.target.value)}
                  placeholder="Random"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-blue-400"
                />
              </div>
            )}

            {/* Buttons row */}
            <div className="flex items-center gap-2 flex-wrap relative">
              <button
                onClick={() => setShowLibrary(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-600 transition-colors"
              >
                <IcBook /> Prompt Library
              </button>

              <div className="relative">
                <button
                  onClick={() => setShowDocs(v => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-600 transition-colors"
                >
                  <IcFileText /> Prompt Docs
                </button>
                {showDocs && <PromptDocsPopover onClose={() => setShowDocs(false)} />}
              </div>

              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setPickError(null);
                if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(f.type)) {
                  setPickError("Only PNG, JPG, WEBP images are supported for the reference image.");
                  return;
                }
                if (refImageMaxBytes != null && f.size > refImageMaxBytes) {
                  setPickError(`Reference image must be under ${refImageMaxSizeLabel}.`);
                  return;
                }
                setRefImage(f);
                setRefImageAsset(null);
              }} />
              {!refImage && !refImageAsset ? (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      modelEntry.imageInput === "required"
                        ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <IcImage /> {modelEntry.imageInput === "required" ? "Reference image required" : "Add reference image"}
                  </button>
                  <button
                    onClick={() => setRefPickerOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Choose from Assets
                  </button>
                </>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs font-medium text-blue-700">
                  <IcImage />
                  <span className="max-w-[120px] truncate">{refImage ? refImage.name : refImageAsset!.name}</span>
                  <button onClick={() => { setRefImage(null); setRefImageAsset(null); }} className="text-blue-400 hover:text-blue-700 transition-colors ml-0.5"><IcX /></button>
                </div>
              )}
              <AssetPicker
                open={refPickerOpen}
                onClose={() => setRefPickerOpen(false)}
                accept={["image"]}
                title="Choose a reference image"
                onSelect={(asset) => { setRefImageAsset(asset); setRefImage(null); setRefPickerOpen(false); }}
              />
            </div>

            {pickError && <p className="text-sm text-red-500">{pickError}</p>}

            {/* Prompt textarea */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Prompt</label>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                maxLength={2000}
                placeholder="Describe the video you want to create..."
                rows={8}
                disabled={job.status === "processing"}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none transition-all disabled:opacity-60"
              />
              <p className="text-[11px] text-gray-400 mt-1 text-right">{prompt.length}/2000</p>
            </div>

            {/* Progress bar */}
            {job.status === "processing" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className="flex items-center gap-1.5"><Spinner /> Generating… this takes 1–3 minutes</span>
                  <span>{job.progress}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${job.progress}%` }} />
                </div>
                <button
                  onClick={() => void job.cancel()}
                  className="text-xs font-medium text-gray-400 hover:text-red-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Error */}
            {job.status === "error" && job.error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{job.error}</p>
            )}

            {job.status === "cancelled" && (
              <p className="text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3">
                Cancelled — your credit was refunded.
              </p>
            )}

            {/* Video result */}
            {job.status === "done" && videoUrl && (
              <div className="space-y-3">
                <video
                  src={videoUrl}
                  controls
                  className="w-full rounded-xl border border-gray-200 bg-black"
                  style={{ maxHeight: 360 }}
                />
                <div className="flex gap-2">
                  <a
                    href={videoUrl}
                    download={downloadName}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-fg hover:bg-fg-muted text-bg text-sm font-semibold transition-colors"
                  >
                    <IcDownload /> Download
                  </a>
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-sm font-semibold text-gray-700 transition-colors"
                  >
                    Generate Another
                  </button>
                </div>
              </div>
            )}

            {/* Generate button */}
            {job.status !== "done" && (
              <button
                onClick={() => void handleGenerate()}
                disabled={!prompt.trim() || job.status === "processing" || uploadingRef || needsImage}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #335CFF 0%, #7B5EA7 100%)" }}
              >
                {job.status === "processing" || uploadingRef ? (
                  <><Spinner /> {uploadingRef ? "Uploading reference image…" : "Generating…"}</>
                ) : needsImage ? (
                  <>Upload a reference image to continue</>
                ) : (
                  <>Generate Video · {currentCredits} {currentCredits === 1 ? "credit" : "credits"} <kbd className="text-[10px] text-white/60 font-normal bg-white/10 px-1.5 py-0.5 rounded">⌘+Enter</kbd></>
                )}
              </button>
            )}
            {job.status !== "done" && !needsImage && (
              <p className="text-[11px] text-gray-400 text-center -mt-2">
                {modelEntry.displayName}
                {supports("resolution") ? ` · ${resolution}` : ""}
                {modelEntry.supportsAudio ? ` · audio ${audio ? "on" : "off"}` : ""}
                {" · "}{effectiveSeconds}s · {currentRate} credits/sec
              </p>
            )}
          </div>
        </div>
      </div>

      {showLibrary && (
        <PromptLibraryModal
          onSelect={text => setPrompt(text)}
          onClose={() => setShowLibrary(false)}
        />
      )}
    </div>
  );
}
