import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export interface GeneratedScript {
  hook: string;
  script: string;
  title: string;
}

export async function generateScript(
  topic: string,
  style: string
): Promise<GeneratedScript> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are a viral short-form video scriptwriter. Create a script for a 60-second vertical video.

Topic: ${topic}
Style: ${style}

Return a JSON object with exactly these keys:
- "title": short video title (max 8 words)
- "hook": opening 1-2 sentences that grab attention immediately (spoken aloud, ~5 seconds)
- "script": the full narration text (hook + body, ~150-200 words, no stage directions, plain spoken words only)

Return ONLY valid JSON, no markdown fences.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // Strip markdown fences if the model includes them despite instructions
  const cleaned = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
  return JSON.parse(cleaned) as GeneratedScript;
}
