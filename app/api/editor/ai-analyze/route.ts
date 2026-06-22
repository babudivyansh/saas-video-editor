import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

const FALLBACK_SUGGESTIONS = [
  {
    priority: "high",
    title: "Add a hook in the first 3 seconds",
    description: "Start with an attention-grabbing text overlay or cut to your most exciting moment.",
    action: "info",
  },
  {
    priority: "medium",
    title: "Trim long pauses",
    description: "Check for clips longer than 5 seconds — consider splitting or speeding them up to maintain pace.",
    action: "info",
  },
  {
    priority: "medium",
    title: "Add background music",
    description: "Drag a track from the Audio panel to keep viewers engaged throughout.",
    action: "info",
  },
  {
    priority: "low",
    title: "Apply a cinematic color grade",
    description: "Select your video clips and apply the Cinematic effect in the Effects panel.",
    action: "info",
  },
];

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { doc?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { doc } = body;
  if (!doc) return NextResponse.json({ error: "doc is required" }, { status: 400 });

  const summary = summarizeDoc(doc);

  const prompt = `You are an expert video editor analyzing a short-form video project. Here is the current timeline:

${summary}

Analyze this timeline and return EXACTLY 4-6 actionable editing suggestions in this JSON format:
{
  "suggestions": [
    {
      "priority": "high" | "medium" | "low",
      "title": "Short title (max 60 chars)",
      "description": "One sentence explanation of WHY this helps",
      "action": "info" | "add-text" | "split" | "speed",
      "params": {}
    }
  ]
}

Rules:
- Focus on viral short-form content best practices (hooks, pacing, captions, music, CTAs)
- At least 1 high priority suggestion
- "action" should be "info" unless you have a specific clip ID and time to act on
- For add-text: include params: { text: "...", start: 0, duration: 3 }
- Return ONLY the JSON object — no markdown, no extra text`;

  try {
    const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();

    // Strip markdown fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed.suggestions)) throw new Error("Bad response shape");

    return NextResponse.json({ suggestions: parsed.suggestions });
  } catch (err) {
    console.error("[ai-analyze] Gemini parse error:", err);
    return NextResponse.json({ suggestions: FALLBACK_SUGGESTIONS });
  }
}

function summarizeDoc(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "Empty project";
  const d = doc as {
    _v?: number;
    aspect?: string;
    fps?: number;
    tracks?: Array<{
      kind: string;
      name: string;
      muted?: boolean;
      hidden?: boolean;
      clips: Array<{ start: number; duration: number; data?: { kind: string; text?: string; url?: string } }>;
    }>;
  };

  if (!d.tracks) return "Empty project (no tracks)";

  const lines: string[] = [
    `Format: TrackDoc v${d._v ?? 1} | Aspect: ${d.aspect ?? "unknown"} | FPS: ${d.fps ?? 30}`,
  ];

  for (const t of d.tracks) {
    if (t.hidden) continue;
    lines.push(`\n[${t.kind.toUpperCase()} TRACK: "${t.name}"]${t.muted ? " (muted)" : ""}`);
    if (t.clips.length === 0) {
      lines.push("  (empty)");
      continue;
    }
    let totalDur = 0;
    const clipSummaries: string[] = [];
    for (const c of t.clips) {
      totalDur += c.duration;
      if (c.data?.kind === "text") {
        clipSummaries.push(`  - text "${c.data.text ?? ""}" at ${c.start.toFixed(1)}s, dur ${c.duration.toFixed(1)}s`);
      } else {
        clipSummaries.push(`  - ${c.data?.kind ?? t.kind} at ${c.start.toFixed(1)}s, dur ${c.duration.toFixed(1)}s`);
      }
    }
    lines.push(`  Total duration: ${totalDur.toFixed(1)}s, ${t.clips.length} clip(s)`);
    lines.push(...clipSummaries.slice(0, 6)); // cap at 6 clips per track
    if (t.clips.length > 6) lines.push(`  ... and ${t.clips.length - 6} more clips`);
  }

  return lines.join("\n");
}
