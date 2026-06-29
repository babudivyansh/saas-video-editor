import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";

type Tone = "funny" | "dramatic" | "romantic" | "scary";

interface Message {
  type: "receiver" | "sender";
  text: string;
}

const TONE_PROMPTS: Record<Tone, string> = {
  funny:    "The conversation should be hilariously awkward, full of unexpected twists, and end with a punchline or funny misunderstanding.",
  dramatic: "The conversation should be emotionally intense, filled with tension, shocking revelations, and high-stakes moments.",
  romantic: "The conversation should be sweet and flirtatious, with genuine emotion, vulnerability, and heartfelt moments.",
  scary:    "The conversation should be unsettling and creepy, building dread gradually with eerie implications or a disturbing reveal.",
};

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "AI script generation not configured" }, { status: 503 });
  }

  let body: { prompt?: string; tone?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const prompt = (body.prompt ?? "").trim().slice(0, 500);
  const tone = (body.tone ?? "dramatic") as Tone;
  if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  if (!["funny", "dramatic", "romantic", "scary"].includes(tone)) {
    return NextResponse.json({ error: "tone must be one of: funny, dramatic, romantic, scary" }, { status: 400 });
  }

  const systemPrompt = `You are a viral TikTok fake-texts screenwriter. Generate a realistic SMS text message conversation for the following topic.

Topic: ${prompt}
Tone: ${tone.toUpperCase()} — ${TONE_PROMPTS[tone]}

Rules:
- Generate between 6 and 10 messages total
- Alternate naturally between receiver and sender — do NOT strictly alternate, the same person can send multiple in a row if realistic
- Keep each message under 120 characters — short, punchy, like real texts
- Make it feel authentic and unscripted
- The "receiver" is the other person (the one being texted); the "sender" is the user
- Do NOT include names, emojis in brackets, or stage directions
- Return ONLY valid JSON — an array of objects with exactly these fields: {"type":"receiver"|"sender","text":"..."}
- No extra commentary, no markdown, no backticks, just the raw JSON array

Example format:
[{"type":"receiver","text":"omg did you see what just happened"},{"type":"sender","text":"no what?"},{"type":"receiver","text":"i cant even explain it rn"}]`;

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(systemPrompt);
    const raw = result.response.text().trim();

    // Strip markdown code fences if Gemini adds them
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    let messages: Message[];
    try {
      const parsed = JSON.parse(jsonStr) as unknown;
      if (!Array.isArray(parsed)) throw new Error("not an array");
      messages = (parsed as Message[]).filter(
        m => (m.type === "receiver" || m.type === "sender") && typeof m.text === "string" && m.text.trim()
      );
      if (messages.length < 2) throw new Error("too few messages");
    } catch {
      console.error("[text-video-script] Bad Gemini JSON:", raw.slice(0, 200));
      return NextResponse.json({ error: "AI returned invalid script — please try again" }, { status: 500 });
    }

    return NextResponse.json({ messages });
  } catch (err) {
    console.error("[text-video-script] Gemini error:", err);
    return NextResponse.json({ error: "Script generation failed — please try again" }, { status: 500 });
  }
}
