import type { ReactNode } from "react";
import { getToolBySlug } from "@/app/components/featureLinks";

/**
 * The artwork inside each ToolMock, one motif per tool.
 *
 * Every motif is drawn on the same 960x400 canvas in the flat white-on-brand
 * language already used by FEATURED_ART in landing/ToolShowcase.tsx — white
 * shapes at three opacities, with brand blue reserved for marks sitting inside
 * a white shape. `Features.tsx` uses teal for the same job; brand blue wins
 * here because the whole marketing surface renders under the emerald theme.
 *
 * These are original drawings of what each tool *does*. Nothing is traced from
 * a reference, and nothing depicts a real person, third-party footage, or
 * another company's logo.
 *
 * Deliberately no text nodes anywhere: SVG <text> inside a role="img" gets read
 * out by screen readers on top of the aria-label, which is the mistake
 * dashboard/toolPreviews.tsx makes with its fake chat transcripts.
 */

export type MotifVariant = "primary" | "secondary";

// Three ink weights, matching PostCover's two-value convention plus a fainter
// step for background structure on this larger canvas.
const INK = "rgba(255,255,255,0.94)";
const SOFT = "rgba(255,255,255,0.40)";
const FAINT = "rgba(255,255,255,0.18)";
/** For marks that sit *inside* a white shape and need to read as brand. */
const BRAND = "#335CFF";

// ---------------------------------------------------------------- primitives

function Panel({ x, y, w, h, r = 16, fill = INK, opacity }: { x: number; y: number; w: number; h: number; r?: number; fill?: string; opacity?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={r} fill={fill} opacity={opacity} />;
}

function Bar({ x, y, w, h = 12, fill = SOFT }: { x: number; y: number; w: number; h?: number; fill?: string }) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} />;
}

/** A 9:16 device frame. */
function Phone({ x, y, h, fill = "rgba(0,0,0,0.22)", stroke = INK }: { x: number; y: number; h: number; fill?: string; stroke?: string }) {
  const w = (h * 9) / 16;
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx={18} fill={fill} />
      <rect x={x} y={y} width={w} height={h} rx={18} fill="none" stroke={stroke} strokeWidth={3} />
    </>
  );
}

/** Vertical bars of varying height, centred on `cy`. */
function Waveform({ x, cy, heights, gap = 12, w = 6, fill = SOFT }: { x: number; cy: number; heights: number[]; gap?: number; w?: number; fill?: string }) {
  return (
    <g>
      {heights.map((h, i) => (
        <rect key={i} x={x + i * (w + gap)} y={cy - h / 2} width={w} height={h} rx={w / 2} fill={fill} />
      ))}
    </g>
  );
}

/** A horizontal track with segments; `active` is drawn at full ink. */
function Track({ x, y, w, h = 18, segments, active }: { x: number; y: number; w: number; h?: number; segments: number[]; active?: number }) {
  const total = segments.reduce((a, b) => a + b, 0);
  const widths = segments.map((seg) => Math.max((seg / total) * (w - 8) - 6, 8));
  // Offsets precomputed rather than accumulated inside the map: the React
  // Compiler treats a variable reassigned during render as a correctness bug.
  const offsets = widths.reduce<number[]>((acc, width, i) => [...acc, i === 0 ? x : acc[i - 1] + widths[i - 1] + 6], []);

  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={FAINT} />
      {widths.map((width, i) => (
        <rect key={i} x={offsets[i] + 4} y={y + 3} width={width} height={h - 6} rx={(h - 6) / 2} fill={i === active ? INK : SOFT} />
      ))}
    </g>
  );
}

/** Stacked subtitle lines with one word-block highlighted. */
function CaptionLines({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g>
      <Bar x={x} y={y} w={w} h={10} />
      <Bar x={x} y={y + 22} w={w * 0.62} h={10} />
      <Bar x={x} y={y + 22} w={w * 0.26} h={10} fill={INK} />
      <Bar x={x} y={y + 44} w={w * 0.8} h={10} />
    </g>
  );
}

function Sparkle({ cx, cy, r, fill = INK }: { cx: number; cy: number; r: number; fill?: string }) {
  const t = r * 0.34;
  return <path d={`M${cx} ${cy - r} L${cx + t} ${cy - t} L${cx + r} ${cy} L${cx + t} ${cy + t} L${cx} ${cy + r} L${cx - t} ${cy + t} L${cx - r} ${cy} L${cx - t} ${cy - t} Z`} fill={fill} />;
}

function Arrow({ x, y, w = 44, stroke = SOFT }: { x: number; y: number; w?: number; stroke?: string }) {
  return <path d={`M${x} ${y} h${w} m-14 -11 l14 11 l-14 11`} fill="none" stroke={stroke} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />;
}

function PlayMark({ cx, cy, r = 22 }: { cx: number; cy: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={INK} />
      <path d={`M${cx - r * 0.28} ${cy - r * 0.42} L${cx + r * 0.46} ${cy} L${cx - r * 0.28} ${cy + r * 0.42} Z`} fill={BRAND} />
    </g>
  );
}

/** Progress ring, `pct` of the way round. */
function Ring({ cx, cy, r, pct = 0.75 }: { cx: number; cy: number; r: number; pct?: number }) {
  const c = 2 * Math.PI * r;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={FAINT} strokeWidth={9} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={INK} strokeWidth={9} strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} transform={`rotate(-90 ${cx} ${cy})`} />
    </g>
  );
}

/** A grid of rounded tiles — result galleries, style pickers, footage pickers. */
function TileGrid({ x, y, cols, rows, tw, th, gap = 12, highlight }: { x: number; y: number; cols: number; rows: number; tw: number; th: number; gap?: number; highlight?: number }) {
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      tiles.push(
        <rect key={i} x={x + c * (tw + gap)} y={y + r * (th + gap)} width={tw} height={th} rx={10} fill={i === highlight ? INK : SOFT} opacity={i === highlight ? 1 : 0.5 + ((i * 7) % 3) * 0.12} />,
      );
    }
  }
  return <g>{tiles}</g>;
}

/** A file/document glyph. */
function Doc({ x, y, w = 54, h = 68 }: { x: number; y: number; w?: number; h?: number }) {
  return (
    <g>
      <path d={`M${x} ${y + 8} a8 8 0 0 1 8 -8 h${w - 24} l16 16 v${h - 16} a8 8 0 0 1 -8 8 h${-(w - 8)} a8 8 0 0 1 -8 -8 Z`} fill={INK} />
      <path d={`M${x + w - 24} ${y} v12 a4 4 0 0 0 4 4 h12`} fill="none" stroke={BRAND} strokeWidth={3} />
    </g>
  );
}

/** The numbered three-panel strip used as most tools' second illustration. */
function StepStrip({ scenes }: { scenes: [ReactNode, ReactNode, ReactNode] }) {
  return (
    <g>
      {scenes.map((scene, i) => {
        const x = 40 + i * 300;
        return (
          <g key={i}>
            <Panel x={x} y={48} w={260} h={304} r={20} fill={FAINT} />
            <circle cx={x + 34} cy={84} r={17} fill={INK} />
            {/* Pips rather than a numeral: hand-pathing digits is fragile (the
                first attempt rendered as stray glyphs) and SVG <text> would
                need its own font handling. One, two, three dots reads
                unambiguously at any size. */}
            <g fill={BRAND}>
              {Array.from({ length: i + 1 }).map((_, p) => (
                <circle key={p} cx={x + 34 + (p - i / 2) * 9} cy={84} r={3} />
              ))}
            </g>
            <g transform={`translate(${x + 20} 120)`}>{scene}</g>
          </g>
        );
      })}
    </g>
  );
}

// ------------------------------------------------------------- step vignettes

const UploadScene = (
  <g>
    <rect x={30} y={20} width={160} height={110} rx={14} fill="none" stroke={SOFT} strokeWidth={3} strokeDasharray="10 8" />
    <circle cx={110} cy={70} r={26} fill={INK} />
    <path d="M110 58 v22 M100 68 l10 -10 l10 10" fill="none" stroke={BRAND} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    <Bar x={62} y={150} w={96} h={10} />
  </g>
);

const VoicePickScene = (
  <g>
    {[0, 1, 2].map((i) => (
      <g key={i}>
        <Panel x={20} y={16 + i * 52} w={180} h={40} r={12} fill={i === 1 ? INK : SOFT} opacity={i === 1 ? 1 : 0.55} />
        <circle cx={44} cy={36 + i * 52} r={12} fill={i === 1 ? BRAND : "rgba(255,255,255,0.75)"} />
      </g>
    ))}
    <Waveform x={140} cy={88} heights={[14, 26, 18, 30, 12]} gap={6} w={5} fill={BRAND} />
  </g>
);

const StylePickScene = (
  <g>
    <TileGrid x={20} y={16} cols={3} rows={3} tw={56} th={38} gap={10} highlight={4} />
  </g>
);

const DownloadScene = (
  <g>
    <Ring cx={110} cy={70} r={40} pct={0.75} />
    <path d="M110 52 v30 M98 70 l12 12 l12 -12" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
    <Bar x={56} y={140} w={108} h={10} />
  </g>
);

const SparkleScene = (
  <g>
    <Panel x={20} y={20} w={180} h={110} r={14} fill={FAINT} />
    <Sparkle cx={110} cy={75} r={34} />
    <Sparkle cx={158} cy={44} r={14} fill={SOFT} />
    <Bar x={62} y={150} w={96} h={10} />
  </g>
);

const PromptScene = (
  <g>
    <Panel x={20} y={26} w={180} h={54} r={12} />
    <Bar x={36} y={44} w={120} h={8} fill={BRAND} />
    <Bar x={36} y={60} w={72} h={8} fill="rgba(51,92,255,0.45)" />
    <Panel x={20} y={96} w={84} h={30} r={10} fill={SOFT} />
    <Panel x={116} y={96} w={84} h={30} r={10} fill={SOFT} />
  </g>
);

const ScriptScene = (
  <g>
    <Panel x={20} y={20} w={180} h={112} r={14} />
    {[130, 154, 118, 140, 96].map((w, i) => (
      <Bar key={i} x={38} y={40 + i * 18} w={w} h={8} fill="rgba(51,92,255,0.42)" />
    ))}
  </g>
);

const ChatScene = (
  <g>
    <Phone x={62} y={10} h={150} />
    <rect x={78} y={34} width={64} height={20} rx={10} fill={SOFT} />
    <rect x={92} y={62} width={54} height={20} rx={10} fill={INK} />
    <rect x={78} y={90} width={70} height={20} rx={10} fill={SOFT} />
    <rect x={96} y={118} width={50} height={20} rx={10} fill={INK} />
  </g>
);

const FootageScene = (
  <g>
    <TileGrid x={20} y={20} cols={3} rows={2} tw={56} th={50} gap={10} highlight={1} />
    <Bar x={56} y={150} w={108} h={10} />
  </g>
);

// -------------------------------------------------------------------- motifs

const PRIMARY: Record<string, ReactNode> = {
  // Preview pane over a multi-track timeline with a playhead.
  "video-editor": (
    <g>
      <Panel x={120} y={54} w={480} h={200} r={18} />
      <PlayMark cx={360} cy={154} r={34} />
      <Track x={120} y={278} w={480} segments={[3, 2, 4]} active={0} />
      <Track x={120} y={308} w={480} segments={[2, 5, 2]} active={1} />
      <path d="M300 262 v70" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <Panel x={648} y={54} w={192} h={278} r={18} fill={FAINT} />
      {[0, 1, 2].map((i) => (
        <Panel key={i} x={672} y={82 + i * 62} w={144} h={44} r={12} fill={SOFT} opacity={0.6} />
      ))}
    </g>
  ),

  // A long filmstrip with three moments bracketed, feeding three scored clips.
  "auto-clip": (
    <g>
      <Track x={80} y={70} w={800} h={44} segments={[2, 1, 3, 1, 2, 1, 2]} active={2} />
      {[188, 470, 690].map((x, i) => (
        <rect key={i} x={x} y={62} width={92} height={60} rx={10} fill="none" stroke={INK} strokeWidth={4} />
      ))}
      {[0, 1, 2].map((i) => {
        const x = 150 + i * 240;
        return (
          <g key={i}>
            <path d={`M${x + 90} 130 v28`} stroke={SOFT} strokeWidth={3} strokeDasharray="6 6" />
            <Phone x={x + 48} y={168} h={168} />
            <PlayMark cx={x + 95} cy={244} r={20} />
            <Bar x={x + 62} y={300} w={66} h={10} fill={INK} />
          </g>
        );
      })}
    </g>
  ),

  // Trim: a frame above a waveform with an in/out selection.
  "cut-and-crop": (
    <g>
      <Panel x={150} y={48} w={660} h={188} r={18} fill={FAINT} />
      <PlayMark cx={480} cy={142} r={32} />
      <Waveform x={172} cy={296} heights={[26, 44, 62, 38, 70, 52, 80, 46, 64, 34, 56, 42, 72, 30, 50, 60, 36, 48]} gap={20} w={8} />
      <rect x={288} y={252} width={330} height={88} rx={12} fill="none" stroke={INK} strokeWidth={4} />
      <rect x={282} y={272} width={12} height={48} rx={6} fill={INK} />
      <rect x={612} y={272} width={12} height={48} rx={6} fill={INK} />
    </g>
  ),

  // A sparkle branching into script, voice, and visuals.
  "ai-creator": (
    <g>
      <g stroke={SOFT} strokeWidth={3} strokeDasharray="7 8" fill="none">
        <path d="M480 200 L250 116" />
        <path d="M480 200 L710 116" />
        <path d="M480 200 L480 316" />
      </g>
      <Sparkle cx={480} cy={200} r={54} />
      <Panel x={168} y={70} w={164} h={92} r={16} />
      {[104, 128, 84].map((w, i) => (
        <Bar key={i} x={190} y={92 + i * 20} w={w} h={8} fill="rgba(51,92,255,0.45)" />
      ))}
      <Panel x={628} y={70} w={164} h={92} r={16} />
      <Waveform x={654} cy={116} heights={[22, 40, 30, 52, 26, 44, 18]} gap={12} w={7} fill={BRAND} />
      <Panel x={398} y={294} w={164} h={78} r={16} />
      <PlayMark cx={480} cy={333} r={22} />
    </g>
  ),

  // A story card feeding a captioned vertical preview.
  "reddit-story-videos": (
    <g>
      <Panel x={110} y={72} w={330} h={228} r={18} />
      <circle cx={148} cy={112} r={18} fill={BRAND} opacity={0.35} />
      <Bar x={178} y={106} w={110} h={10} fill="rgba(51,92,255,0.5)" />
      {[266, 240, 282, 210].map((w, i) => (
        <Bar key={i} x={138} y={152 + i * 26} w={w} h={9} fill="rgba(51,92,255,0.32)" />
      ))}
      <Arrow x={472} y={186} w={56} stroke={INK} />
      <Phone x={572} y={48} h={304} />
      <Panel x={598} y={92} w={124} h={70} r={12} fill={SOFT} />
      <CaptionLines x={598} y={244} w={124} />
    </g>
  ),

  // Three phones fanned out, the centre one showing a message thread.
  "fake-texts-videos": (
    <g>
      <g transform="rotate(-9 300 200)">
        <Phone x={228} y={92} h={228} fill="rgba(0,0,0,0.16)" stroke={SOFT} />
      </g>
      <g transform="rotate(9 660 200)">
        <Phone x={604} y={92} h={228} fill="rgba(0,0,0,0.16)" stroke={SOFT} />
      </g>
      <Phone x={412} y={52} h={296} />
      <rect x={438} y={104} width={92} height={26} rx={13} fill={SOFT} />
      <rect x={472} y={144} width={82} height={26} rx={13} fill={INK} />
      <rect x={438} y={184} width={100} height={26} rx={13} fill={SOFT} />
      <rect x={486} y={224} width={68} height={26} rx={13} fill={INK} />
      <Bar x={452} y={286} w={104} h={10} fill={INK} />
    </g>
  ),

  // One vertical frame split into two stacked panes with a caption strip.
  "viral-split-screen": (
    <g>
      <Panel x={150} y={92} w={230} h={216} r={16} fill={FAINT} />
      <PlayMark cx={265} cy={200} r={30} />
      <Arrow x={420} y={200} w={60} stroke={INK} />
      <Phone x={556} y={40} h={320} />
      <rect x={574} y={58} width={144} height={128} rx={10} fill={SOFT} />
      <rect x={574} y={214} width={144} height={128} rx={10} fill="rgba(255,255,255,0.24)" />
      <rect x={574} y={186} width={144} height={28} rx={8} fill={INK} />
      <Bar x={596} y={196} w={100} h={8} fill={BRAND} />
    </g>
  ),

  // A prompt bar resolving into a row of generated frames.
  "ai-image-generator": (
    <g>
      <Panel x={200} y={62} w={560} h={72} r={18} />
      <Bar x={232} y={84} w={330} h={10} fill="rgba(51,92,255,0.5)" />
      <Bar x={232} y={104} w={196} h={10} fill="rgba(51,92,255,0.3)" />
      <Sparkle cx={706} cy={98} r={22} fill={BRAND} />
      <path d="M480 142 v34" stroke={SOFT} strokeWidth={3} strokeDasharray="7 7" />
      <TileGrid x={200} y={190} cols={4} rows={1} tw={128} th={150} gap={16} highlight={1} />
    </g>
  ),

  // A script card feeding a stack of voice options, one of them playing.
  "ai-voiceover": (
    <g>
      <Panel x={110} y={70} w={336} h={244} r={18} />
      {[268, 292, 240, 284, 212, 256].map((w, i) => (
        <Bar key={i} x={142} y={104 + i * 30} w={w} h={9} fill="rgba(51,92,255,0.4)" />
      ))}
      <Arrow x={478} y={192} w={56} stroke={INK} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Panel x={578} y={82 + i * 84} w={272} h={64} r={16} fill={i === 1 ? INK : SOFT} opacity={i === 1 ? 1 : 0.5} />
          <circle cx={614} cy={114 + i * 84} r={16} fill={i === 1 ? BRAND : "rgba(255,255,255,0.8)"} />
          {i === 1 && <Waveform x={654} cy={114 + i * 84} heights={[16, 30, 22, 36, 18, 28]} gap={9} w={6} fill={BRAND} />}
        </g>
      ))}
    </g>
  ),

  // A prompt resolving into a vertical clip with a duration chip.
  "ai-video-generator": (
    <g>
      <Panel x={130} y={92} w={340} h={72} r={18} />
      <Bar x={162} y={114} w={224} h={10} fill="rgba(51,92,255,0.5)" />
      <Bar x={162} y={134} w={140} h={10} fill="rgba(51,92,255,0.3)" />
      <Sparkle cx={300} cy={216} r={30} />
      <Arrow x={500} y={200} w={56} stroke={INK} />
      <Phone x={600} y={44} h={312} />
      <PlayMark cx={688} cy={200} r={30} />
      <rect x={620} y={300} width={64} height={24} rx={12} fill={INK} />
    </g>
  ),

  // Source portrait, swap control, result portrait.
  "ai-face-swap": (
    <g>
      <Panel x={130} y={78} w={250} h={244} r={18} fill={FAINT} />
      <circle cx={255} cy={168} r={44} fill={SOFT} />
      <path d="M195 286 a60 56 0 0 1 120 0 z" fill={SOFT} />
      <circle cx={480} cy={200} r={38} fill={INK} />
      <path d="M466 190 a16 16 0 1 1 4 12 M466 178 v12 h12" fill="none" stroke={BRAND} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      <Panel x={580} y={78} w={250} h={244} r={18} />
      <circle cx={705} cy={168} r={44} fill={BRAND} opacity={0.35} />
      <path d="M645 286 a60 56 0 0 1 120 0 z" fill={BRAND} opacity={0.35} />
    </g>
  ),

  // Subject on a background, then the same subject on transparency.
  "background-remover": (
    <g>
      <Panel x={110} y={78} w={310} h={244} r={18} fill={SOFT} />
      <circle cx={265} cy={172} r={42} fill={INK} />
      <path d="M207 288 a58 54 0 0 1 116 0 z" fill={INK} />
      <Arrow x={462} y={200} w={56} stroke={INK} />
      <Panel x={560} y={78} w={310} h={244} r={18} fill={FAINT} />
      <g opacity={0.35}>
        {Array.from({ length: 40 }).map((_, i) => {
          const c = i % 8;
          const r = Math.floor(i / 8);
          return (r + c) % 2 === 0 ? <rect key={i} x={576 + c * 36} y={94 + r * 42} width={36} height={42} fill={INK} /> : null;
        })}
      </g>
      <circle cx={715} cy={172} r={42} fill={INK} />
      <path d="M657 288 a58 54 0 0 1 116 0 z" fill={INK} />
    </g>
  ),

  // Your recording converted into a chosen voice.
  "ai-voice-changer": (
    <g>
      <Panel x={110} y={92} w={300} h={130} r={18} fill={FAINT} />
      <Waveform x={140} cy={157} heights={[28, 52, 36, 64, 30, 48, 22, 56, 34]} gap={19} w={7} />
      <circle cx={480} cy={157} r={34} fill={INK} />
      <path d="M466 148 a16 16 0 1 1 3 11 M466 137 v11 h11" fill="none" stroke={BRAND} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      <Panel x={550} y={92} w={300} h={130} r={18} />
      <Waveform x={580} cy={157} heights={[34, 58, 42, 70, 36, 54, 28, 62, 40]} gap={19} w={7} fill={BRAND} />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={366 + i * 76} cy={306} r={30} fill={i === 1 ? INK : SOFT} opacity={i === 1 ? 1 : 0.55} />
      ))}
    </g>
  ),

  // One mixed track separating into two stems.
  "ai-vocal-remover": (
    <g>
      <Panel x={330} y={54} w={300} h={104} r={18} fill={FAINT} />
      <Waveform x={358} cy={106} heights={[30, 54, 38, 66, 32, 50, 26, 58, 36]} gap={19} w={7} />
      <path d="M420 168 q-70 30 -110 68 M540 168 q70 30 110 68" fill="none" stroke={SOFT} strokeWidth={3} strokeDasharray="7 7" />
      <Panel x={110} y={250} w={300} h={102} r={18} />
      <Waveform x={140} cy={301} heights={[24, 44, 30, 52, 26, 40, 20]} gap={22} w={7} fill={BRAND} />
      <Panel x={550} y={250} w={300} h={102} r={18} />
      <Waveform x={580} cy={301} heights={[40, 22, 48, 30, 44, 26, 38]} gap={22} w={7} fill={BRAND} />
    </g>
  ),

  // A noisy waveform cleaned to an even one.
  "ai-speech-enhancer": (
    <g>
      <circle cx={480} cy={104} r={48} fill={INK} />
      <rect x={468} y={80} width={24} height={38} rx={12} fill={BRAND} />
      <path d="M456 108 a24 24 0 0 0 48 0 M480 132 v14" fill="none" stroke={BRAND} strokeWidth={4} strokeLinecap="round" />
      <Panel x={110} y={214} w={330} h={112} r={18} fill={FAINT} />
      <Waveform x={138} cy={270} heights={[18, 62, 24, 70, 14, 54, 30, 66, 20]} gap={20} w={7} />
      <Arrow x={478} y={270} w={56} stroke={INK} />
      <Panel x={580} y={214} w={270} h={112} r={18} />
      <Waveform x={608} cy={270} heights={[38, 44, 40, 46, 38, 44, 40, 46]} gap={20} w={7} fill={BRAND} />
    </g>
  ),

  // Captions burned into a frame, then dissolved away.
  "subtitle-remover": (
    <g>
      <Panel x={110} y={90} w={330} h={220} r={18} fill={SOFT} />
      <rect x={148} y={244} width={254} height={18} rx={9} fill="rgba(0,0,0,0.42)" />
      <rect x={186} y={272} width={178} height={16} rx={8} fill="rgba(0,0,0,0.42)" />
      <Arrow x={480} y={200} w={56} stroke={INK} />
      <Panel x={580} y={90} w={330} h={220} r={18} fill={FAINT} />
      <g fill={INK} opacity={0.5}>
        {[[622, 250], [664, 268], [706, 246], [748, 272], [790, 252], [830, 266]].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={3 + (i % 3)} />
        ))}
      </g>
      <PlayMark cx={745} cy={186} r={26} />
    </g>
  ),

  // A prompt sparking a ranked list of ideas.
  "ai-brainstormer": (
    <g>
      <Panel x={110} y={70} w={300} h={72} r={18} />
      <Bar x={140} y={94} w={196} h={10} fill="rgba(51,92,255,0.5)" />
      <Bar x={140} y={114} w={124} h={10} fill="rgba(51,92,255,0.3)" />
      <Sparkle cx={260} cy={224} r={46} />
      <Arrow x={366} y={200} w={54} stroke={INK} />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <Panel x={462} y={62 + i * 74} w={400} h={58} r={16} fill={i === 0 ? INK : SOFT} opacity={i === 0 ? 1 : 0.5} />
          <circle cx={496} cy={91 + i * 74} r={14} fill={i === 0 ? BRAND : "rgba(255,255,255,0.8)"} />
          <Bar x={528} y={86 + i * 74} w={280 - i * 26} h={9} fill={i === 0 ? BRAND : "rgba(255,255,255,0.85)"} />
        </g>
      ))}
    </g>
  ),

  // One dead channel, then both channels even.
  "audio-balancer": (
    <g>
      <Panel x={110} y={80} w={330} h={240} r={18} fill={FAINT} />
      <Waveform x={142} cy={148} heights={[26, 48, 34, 56, 30, 44, 22, 52, 28]} gap={20} w={7} />
      <Bar x={142} y={250} w={266} h={6} fill="rgba(255,255,255,0.28)" />
      <Arrow x={480} y={200} w={56} stroke={INK} />
      <Panel x={580} y={80} w={330} h={240} r={18} />
      <Waveform x={612} cy={148} heights={[30, 46, 36, 52, 32, 44, 26, 50, 34]} gap={20} w={7} fill={BRAND} />
      <Waveform x={612} cy={252} heights={[30, 46, 36, 52, 32, 44, 26, 50, 34]} gap={20} w={7} fill={BRAND} />
    </g>
  ),

  // A heavy file squeezed into a light one.
  "video-compressor": (
    <g>
      <circle cx={270} cy={200} r={116} fill={INK} opacity={0.16} />
      <circle cx={270} cy={200} r={84} fill={INK} opacity={0.2} />
      <Doc x={240} y={164} w={62} h={78} />
      <g stroke={SOFT} strokeWidth={2.5} fill="none">
        {[-36, -18, 0, 18, 36].map((dy, i) => (
          <path key={i} d={`M400 ${200 + dy} q80 ${-dy * 0.55} 160 0`} />
        ))}
      </g>
      <path d="M470 186 l16 14 l-16 14 l6 -14 z" fill={INK} />
      <circle cx={700} cy={200} r={96} fill="rgba(0,0,0,0.24)" />
      <circle cx={700} cy={200} r={64} fill="rgba(0,0,0,0.18)" />
      <Doc x={678} y={176} w={46} h={54} />
    </g>
  ),

  // Any media file becoming an audio file.
  "mp3-converter": (
    <g>
      <circle cx={270} cy={200} r={112} fill={INK} opacity={0.16} />
      <Panel x={214} y={150} w={112} h={100} r={16} />
      <path d="M254 176 l34 24 l-34 24 z" fill={BRAND} />
      <g stroke={SOFT} strokeWidth={2.5} fill="none">
        {[-30, -15, 0, 15, 30].map((dy, i) => (
          <path key={i} d={`M400 ${200 + dy} q80 ${-dy * 0.5} 160 0`} />
        ))}
      </g>
      <circle cx={700} cy={200} r={112} fill={INK} opacity={0.16} />
      <Panel x={644} y={150} w={112} h={100} r={16} />
      <g fill={BRAND}>
        <circle cx={676} cy={222} r={13} />
        <circle cx={722} cy={212} r={13} />
        <path d="M686 222 v-40 l46 -10 v40" fill="none" stroke={BRAND} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </g>
  ),

  // A pasted link resolving to a quality choice and a download.
  "youtube-downloader": (
    <g>
      <Panel x={130} y={64} w={700} h={68} r={18} />
      <circle cx={172} cy={98} r={18} fill={BRAND} opacity={0.28} />
      <path d="M167 90 l12 8 l-12 8 z" fill={BRAND} />
      <Bar x={206} y={93} w={380} h={10} fill="rgba(51,92,255,0.4)" />
      <Panel x={704} y={78} w={104} h={40} r={20} fill={BRAND} opacity={0.9} />
      <Panel x={130} y={168} w={400} h={192} r={18} fill={FAINT} />
      <PlayMark cx={330} cy={264} r={32} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Panel x={572} y={172 + i * 58} w={258} h={44} r={12} fill={i === 1 ? INK : SOFT} opacity={i === 1 ? 1 : 0.45} />
          <circle cx={602} cy={194 + i * 58} r={10} fill={i === 1 ? BRAND : "rgba(255,255,255,0.75)"} />
        </g>
      ))}
      <Bar x={572} y={340} w={210} h={12} fill={INK} />
    </g>
  ),

  // A pasted link resolving to saved vertical posts.
  "instagram-downloader": (
    <g>
      <Panel x={130} y={70} w={700} h={68} r={18} />
      <rect x={158} y={84} width={40} height={40} rx={12} fill="none" stroke={BRAND} strokeWidth={4} />
      <circle cx={178} cy={104} r={9} fill="none" stroke={BRAND} strokeWidth={4} />
      <Bar x={222} y={99} w={360} h={10} fill="rgba(51,92,255,0.4)" />
      <Panel x={700} y={84} w={108} h={40} r={20} fill={BRAND} opacity={0.9} />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <Phone x={186 + i * 160} y={178} h={182} fill={i === 1 ? "rgba(255,255,255,0.24)" : "rgba(0,0,0,0.2)"} stroke={i === 1 ? INK : SOFT} />
          {i === 1 && <PlayMark cx={237} cy={269} r={22} />}
        </g>
      ))}
    </g>
  ),
};

const SECONDARY: Record<string, ReactNode> = {
  // The crop half of Cut & Crop — a wide frame reframed to vertical.
  "cut-and-crop": (
    <g>
      <Panel x={110} y={70} w={740} h={260} r={18} fill={FAINT} />
      <rect x={404} y={70} width={152} height={260} rx={10} fill="rgba(255,255,255,0.16)" />
      <rect x={404} y={70} width={152} height={260} rx={10} fill="none" stroke={INK} strokeWidth={4} />
      <g stroke={SOFT} strokeWidth={2}>
        <path d="M404 157 h152 M404 244 h152 M455 70 v260 M506 70 v260" />
      </g>
      <PlayMark cx={480} cy={200} r={28} />
      {[0, 1, 2, 3].map((i) => (
        <Panel key={i} x={332 + i * 84} y={352} w={68} h={26} r={13} fill={i === 0 ? INK : SOFT} opacity={i === 0 ? 1 : 0.5} />
      ))}
    </g>
  ),
  "reddit-story-videos": <StepStrip scenes={[ScriptScene, VoicePickScene, StylePickScene]} />,
  "fake-texts-videos": <StepStrip scenes={[ChatScene, VoicePickScene, FootageScene]} />,
  "viral-split-screen": <StepStrip scenes={[UploadScene, FootageScene, StylePickScene]} />,
  "ai-image-generator": <StepStrip scenes={[PromptScene, SparkleScene, DownloadScene]} />,
  "ai-voiceover": <StepStrip scenes={[ScriptScene, VoicePickScene, DownloadScene]} />,
  "background-remover": <StepStrip scenes={[UploadScene, SparkleScene, DownloadScene]} />,
  "ai-speech-enhancer": <StepStrip scenes={[UploadScene, SparkleScene, DownloadScene]} />,
};

/** What each illustration depicts, for the aria-label. */
const DESCRIPTIONS: Record<string, string> = {
  "video-editor": "a video preview above a multi-track timeline with a playhead",
  "auto-clip": "a long timeline with three moments bracketed, each becoming a vertical clip",
  "cut-and-crop": "a video frame above a waveform with an in and out selection",
  "ai-creator": "a spark branching out into a script, a voice, and a finished clip",
  "reddit-story-videos": "a story card feeding a captioned vertical video",
  "fake-texts-videos": "three phones showing an animated message thread",
  "viral-split-screen": "a clip and background footage stacked into one vertical frame with captions",
  "ai-image-generator": "a prompt box resolving into a row of generated images",
  "ai-voiceover": "a script feeding a list of voices, one of them playing",
  "ai-video-generator": "a prompt resolving into a short vertical clip",
  "ai-face-swap": "a source portrait and a result portrait either side of a swap control",
  "background-remover": "a subject on a background beside the same subject on transparency",
  "ai-voice-changer": "a recorded waveform converted into a chosen AI voice",
  "ai-vocal-remover": "one mixed track separating into a vocal and an instrumental stem",
  "ai-speech-enhancer": "an uneven waveform cleaned into an even one",
  "subtitle-remover": "a frame with burned-in captions beside the same frame cleaned",
  "ai-brainstormer": "a topic sparking a ranked list of video ideas",
  "audio-balancer": "audio with one dead channel corrected to two even channels",
  "video-compressor": "a large file squeezed into a much smaller one",
  "mp3-converter": "a video file converted into an audio file",
  "youtube-downloader": "a pasted link with a quality picker and a download in progress",
  "instagram-downloader": "a pasted link with saved vertical posts ready to download",
};

const SECONDARY_DESCRIPTIONS: Record<string, string> = {
  "cut-and-crop": "a widescreen frame being reframed to vertical with aspect-ratio options",
};

/** Fallbacks so a tool without its own drawing is never left with a blank hero. */
const CATEGORY_FALLBACK: Record<string, string> = {
  video: "auto-clip",
  ai: "ai-image-generator",
  free: "mp3-converter",
};

export function getMotif(slug: string, variant: MotifVariant = "primary"): ReactNode {
  if (variant === "secondary") return SECONDARY[slug] ?? null;
  if (PRIMARY[slug]) return PRIMARY[slug];
  const category = getToolBySlug(slug)?.category;
  return PRIMARY[CATEGORY_FALLBACK[category ?? "video"]];
}

export function hasSecondaryMotif(slug: string): boolean {
  return slug in SECONDARY;
}

export function motifLabel(slug: string, variant: MotifVariant, toolTitle: string): string {
  if (variant === "secondary") {
    const specific = SECONDARY_DESCRIPTIONS[slug];
    return specific ? `Illustration: ${specific}` : `Illustration: the three steps to using ${toolTitle}`;
  }
  const description = DESCRIPTIONS[slug];
  return description ? `Illustration: ${description}` : `Illustration representing ${toolTitle}`;
}
