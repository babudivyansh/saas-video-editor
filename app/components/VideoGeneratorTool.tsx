"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";

// ── Models / options ──────────────────────────────────────────────────────────
const MODELS = [
  { slug: "veo3-fast", name: "VEO3 Fast", badge: "20 credits" },
];
const DURATIONS = ["5s", "8s"];
const RATIOS    = ["16:9", "9:16", "1:1"];

type PromptEntry = { id: string; category: string; label: string; text: string; gradient: string };

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
  onChange,
}: {
  label: string;
  value: string;
  options: T[];
  getSlug: (o: T) => string;
  getLabel: (o: T) => string;
  getBadge?: (o: T) => string | null | undefined;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => getSlug(o) === value) ?? options[0];

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-gray-500 mb-1.5">{label}</p>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(o => !o)}
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
            {options.map(opt => {
              const slug = getSlug(opt);
              const badge = getBadge?.(opt);
              return (
                <button
                  key={slug}
                  onClick={() => { onChange(slug); setOpen(false); }}
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
        style={{ maxWidth: 860, height: 540 }}
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

        {/* Body: thumbnails | prompt text | video */}
        <div className="flex flex-1 min-h-0">

          {/* Col 1: thumbnail list */}
          <div className="w-44 flex-shrink-0 overflow-y-auto border-r border-gray-100 py-2">
            {filtered.map(p => (
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
                  <div className="absolute inset-0 flex items-center justify-center">
                    <IcPlay />
                  </div>
                </div>
              </button>
            ))}
          </div>

          {selected && (
            <>
              {/* Col 2: video preview */}
              <div className="flex-1 flex flex-col justify-center p-4 border-r border-gray-100 min-w-0">
                <div
                  className="w-full rounded-xl overflow-hidden relative flex items-center justify-center"
                  style={{ aspectRatio: "16/9", background: selected.gradient }}
                >
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
                </div>
              </div>

              {/* Col 3: prompt text + button */}
              <div className="w-72 flex-shrink-0 flex flex-col p-5 gap-4">
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
type Stage = "idle" | "generating" | "complete" | "error";

export default function VideoGeneratorTool() {
  const { refreshUser } = useAuth();

  const [model,       setModel]       = useState("veo3-fast");
  const [duration,    setDuration]    = useState("8s");
  const [ratio,       setRatio]       = useState("16:9");
  const [prompt,      setPrompt]      = useState("");
  const [stage,       setStage]       = useState<Stage>("idle");
  const [progress,    setProgress]    = useState(0);
  const [errorMsg,    setErrorMsg]    = useState("");
  const [videoUrl,    setVideoUrl]    = useState<string | null>(null);
  const [downloadName,setDownloadName]= useState("ai-video.mp4");
  const [showLibrary, setShowLibrary] = useState(false);
  const [showDocs,    setShowDocs]    = useState(false);
  const [refImage,    setRefImage]    = useState<File | null>(null);

  const fileInputRef  = useRef<HTMLInputElement>(null);
  const textareaRef   = useRef<HTMLTextAreaElement>(null);

  const handleGenerate = async () => {
    if (!prompt.trim() || stage === "generating") return;

    const token = localStorage.getItem("token");
    if (!token) { setErrorMsg("Please log in to use this tool."); return; }

    setStage("generating");
    setProgress(5);
    setErrorMsg("");
    setVideoUrl(null);

    try {
      const body: Record<string, unknown> = {
        prompt: prompt.trim(),
        model,
        duration: parseInt(duration),
        aspectRatio: ratio,
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

      const { jobId } = await res.json();
      const name = `ai-video-${Date.now()}.mp4`;
      setDownloadName(name);

      await new Promise<void>((resolve, reject) => {
        const interval = setInterval(async () => {
          try {
            const poll = await fetch(`/api/tools/video-generator?jobId=${jobId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const data = await poll.json();
            if (data.progress != null) setProgress(data.progress);
            if (data.status === "done") { clearInterval(interval); resolve(); }
            else if (data.status === "error") { clearInterval(interval); reject(new Error(data.error ?? "Generation failed")); }
          } catch (err) { clearInterval(interval); reject(err); }
        }, 2000);
      });

      setProgress(100);

      const dlRes = await fetch(`/api/tools/video-generator?jobId=${jobId}&download=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!dlRes.ok) throw new Error("Download failed");

      const blob = await dlRes.blob();
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);

      const a = document.createElement("a");
      a.href = url; a.download = name; a.click();

      await refreshUser();
      setStage("complete");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setStage("error");
    }
  };

  // Keyboard shortcut
  useEffect(() => {
    function h(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && stage === "idle" && prompt.trim()) {
        e.preventDefault();
        handleGenerate();
      }
    }
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const handleReset = () => {
    setStage("idle");
    setProgress(0);
    setErrorMsg("");
    if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(null); }
  };

  const durationOptions = DURATIONS.map(d => ({ slug: d, name: d }));
  const ratioOptions    = RATIOS.map(r => ({ slug: r, name: r }));

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-3xl mx-auto">
        {/* Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">VEO3 Generator</h1>
          <p className="text-sm text-gray-500 mt-1">Generate stunning videos from text with AI</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-visible">
          <div className="p-6 space-y-5">

            {/* Dropdowns row */}
            <div className="flex gap-3">
              <Dropdown
                label="Model"
                value={model}
                options={MODELS}
                getSlug={o => o.slug}
                getLabel={o => o.name}
                getBadge={o => o.badge}
                onChange={setModel}
              />
              <Dropdown
                label="Duration"
                value={duration}
                options={durationOptions}
                getSlug={o => o.slug}
                getLabel={o => o.name}
                onChange={setDuration}
              />
              <Dropdown
                label="Aspect Ratio"
                value={ratio}
                options={ratioOptions}
                getSlug={o => o.slug}
                getLabel={o => o.name}
                onChange={setRatio}
              />
            </div>

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

              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => {
                const f = e.target.files?.[0]; if (f) setRefImage(f); e.target.value = "";
              }} />
              {!refImage ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-600 transition-colors"
                >
                  <IcImage /> Add reference image
                </button>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs font-medium text-blue-700">
                  <IcImage />
                  <span className="max-w-[120px] truncate">{refImage.name}</span>
                  <button onClick={() => setRefImage(null)} className="text-blue-400 hover:text-blue-700 transition-colors ml-0.5"><IcX /></button>
                </div>
              )}
            </div>

            {/* Prompt textarea */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Prompt</label>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Describe the video you want to create..."
                rows={8}
                disabled={stage === "generating"}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none transition-all disabled:opacity-60"
              />
              <p className="text-[11px] text-gray-400 mt-1 text-right">{prompt.length}/2000</p>
            </div>

            {/* Progress bar */}
            {stage === "generating" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className="flex items-center gap-1.5"><Spinner /> Generating… this takes 1–3 minutes</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {/* Error */}
            {errorMsg && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{errorMsg}</p>
            )}

            {/* Video result */}
            {stage === "complete" && videoUrl && (
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
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold transition-colors"
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
            {stage !== "complete" && (
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || stage === "generating"}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #335CFF 0%, #7B5EA7 100%)" }}
              >
                {stage === "generating" ? (
                  <><Spinner /> Generating…</>
                ) : (
                  <>Generate Video <kbd className="text-[10px] text-white/60 font-normal bg-white/10 px-1.5 py-0.5 rounded">⌘+Enter</kbd></>
                )}
              </button>
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
