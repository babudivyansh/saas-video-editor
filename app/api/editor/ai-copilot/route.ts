import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { OP_SYSTEM_PROMPT, parseOps, type EditorOp } from "@/lib/editor-ops";

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

// Agentic co-editor: turn a natural-language command into a structured plan of
// edit operations the client applies to the TrackDoc. Falls back to plain advice
// if the model can't produce a valid plan.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { command?: string; doc?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const { command, doc } = body;
  if (!command) return NextResponse.json({ error: "command is required" }, { status: 400 });

  const prompt = `${OP_SYSTEM_PROMPT}

Current timeline:
${summarizeDoc(doc)}

User request: "${command}"`;

  try {
    const model = genai.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const parsed = JSON.parse(stripFences(text)) as { summary?: string; steps?: unknown };
    const steps: EditorOp[] = parseOps(parsed.steps);
    const summary = typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : steps.length ? "Here's what I'll do:" : "I couldn't map that to an edit I can make yet.";
    return NextResponse.json({ message: summary, steps });
  } catch (err) {
    console.error("[ai-copilot] error:", err);
    return NextResponse.json({ message: "I had trouble planning that. Try rephrasing (e.g. 'cut the silences and add captions').", steps: [] });
  }
}

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function summarizeDoc(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "Empty project";
  const d = doc as { tracks?: { kind: string; clips: unknown[] }[]; aspect?: string };
  if (!d.tracks) return "Empty project";
  const lines = [`Aspect: ${d.aspect ?? "unknown"}`];
  for (const t of d.tracks) lines.push(`${t.kind} track: ${t.clips.length} clips`);
  return lines.join("\n");
}
