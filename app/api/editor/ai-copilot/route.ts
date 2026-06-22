import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { command?: string; doc?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { command, doc } = body;
  if (!command) return NextResponse.json({ error: "command is required" }, { status: 400 });

  const docSummary = summarizeDoc(doc);

  const prompt = `You are an AI video editing assistant for a browser-based video editor.
The user is editing a project with the following timeline:
${docSummary}

The user's command: "${command}"

Respond with a helpful, concise message (2-3 sentences) explaining:
1. What action you would take based on their command
2. Any specific advice or tips for their video

Keep your response friendly and actionable. If the command is ambiguous, ask for clarification.
Do not respond with code or JSON — just plain text.`;

  try {
    const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const message = result.response.text().trim();
    return NextResponse.json({ message });
  } catch (err) {
    console.error("[ai-copilot] Gemini error:", err);
    return NextResponse.json({ message: "I had trouble processing that. Please try again." });
  }
}

function summarizeDoc(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "Empty project";
  const d = doc as { tracks?: { kind: string; clips: unknown[] }[]; aspect?: string };
  if (!d.tracks) return "Empty project";
  const lines = [`Aspect: ${d.aspect ?? "unknown"}`];
  for (const t of d.tracks) {
    lines.push(`${t.kind} track: ${t.clips.length} clips`);
  }
  return lines.join("\n");
}
