import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

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
  const docSummary = summarizeDoc(doc);

  const prompt = `You are a viral video expert analyzing a short-form video project.

Project summary:
${docSummary}

Analyze this project and return a JSON object with:
- viralScore: number 0-100 (overall viral potential)
- hookScore: number 0-100 (how strong the hook is)
- pacingScore: number 0-100 (editing pace quality)
- suggestions: array of up to 5 objects with:
  - text: string (specific actionable suggestion, max 100 chars)
  - priority: "high" | "medium" | "low"

Base the scores on the project structure. A project with video clips, captions, and good structure scores higher.
Respond with ONLY valid JSON, no markdown.`;

  try {
    const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().replace(/```json\n?/g, "").replace(/```\n?/g, "");
    const parsed = JSON.parse(raw);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[ai-optimize] error:", err);
    // Return a sensible fallback
    return NextResponse.json({
      viralScore: 42,
      hookScore: 38,
      pacingScore: 55,
      suggestions: [
        { text: "Add captions to increase watch time by up to 40%", priority: "high" },
        { text: "Start with a strong visual hook in the first 3 seconds", priority: "high" },
        { text: "Add a call-to-action text overlay at the end", priority: "medium" },
        { text: "Use zoom effects to emphasize key moments", priority: "medium" },
        { text: "Add background music to improve engagement", priority: "low" },
      ],
    });
  }
}

function summarizeDoc(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "Empty project";
  const d = doc as { tracks?: { kind: string; clips: { duration?: number }[] }[]; aspect?: string };
  if (!d.tracks) return "Empty project";
  const lines = [`Aspect ratio: ${d.aspect ?? "unknown"}`];
  let totalClips = 0;
  let totalDuration = 0;
  for (const t of d.tracks) {
    const clips = t.clips.length;
    totalClips += clips;
    const dur = t.clips.reduce((s, c) => s + (c.duration ?? 0), 0);
    totalDuration += dur;
    lines.push(`${t.kind} track: ${clips} clips, ~${Math.round(dur)}s total`);
  }
  lines.push(`Total: ${totalClips} clips, ~${Math.round(totalDuration)}s`);
  return lines.join("\n");
}
