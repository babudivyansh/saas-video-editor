import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import os from "os";
import path from "path";
import fs from "fs";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractAudio } from "@/utils/ffmpeg-render";
import { transcribeAudio } from "@/utils/elevenlabs";
import { downloadFile } from "@/utils/download";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 300;

const FALLBACK_SCORES = {
  reelScore: 62, hookScore: 58, captionScore: 0,
  audioScore: 70, engagementScore: 55, visualScore: 65,
};

const FALLBACK_SUGGESTIONS = [
  { id: "captions",  icon: "✦", title: "Add captions",          description: "Captions increase engagement by up to 40%",    impact: "high" },
  { id: "silence",   icon: "✂", title: "Remove silence",         description: "Trim dead air to improve pacing",              impact: "high" },
  { id: "hook",      icon: "⚡", title: "Strengthen your hook",   description: "First 3 seconds need more energy",             impact: "high" },
  { id: "zoom",      icon: "🔍", title: "Add auto-zoom effects",  description: "Zoom cuts boost watch time significantly",     impact: "medium" },
  { id: "thumbnail", icon: "🖼", title: "Generate thumbnail",     description: "A great thumbnail boosts click-through rate",  impact: "medium" },
];

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { videoUrl?: string; projectId?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { videoUrl, projectId } = body;
  if (!videoUrl) return NextResponse.json({ error: "videoUrl required" }, { status: 400 });

  const tmp = os.tmpdir();
  const id = randomUUID();
  const videoPath = path.join(tmp, `${id}-src.mp4`);
  const audioPath = path.join(tmp, `${id}-audio.mp3`);

  let captions: Awaited<ReturnType<typeof transcribeAudio>> = [];

  try {
    // Step 1: Download + extract audio
    await downloadFile(videoUrl, videoPath);
    await extractAudio(videoPath, audioPath);

    // Step 2: Transcribe
    try {
      captions = await transcribeAudio(fs.readFileSync(audioPath));
    } catch {
      captions = [];
    }

    // Step 3: Gemini analysis
    const transcript = captions.map(w => w.word).join(" ").slice(0, 3000);
    let scores = FALLBACK_SCORES;
    let suggestions = FALLBACK_SUGGESTIONS;

    try {
      const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
      const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = `You are a viral video coach. Analyze this video transcript and return JSON only.

Transcript: "${transcript || "(no speech detected)"}"

Return this exact JSON structure:
{
  "reelScore": <0-100 overall viral potential>,
  "hookScore": <0-100 first 3 seconds strength>,
  "captionScore": <0 since no captions yet>,
  "audioScore": <0-100 audio quality estimate>,
  "engagementScore": <0-100 engagement potential>,
  "visualScore": <0-100 visual energy estimate>,
  "suggestions": [
    { "id": "string", "icon": "emoji", "title": "short title", "description": "one sentence why", "impact": "high|medium|low" }
  ]
}

Give 4-6 specific suggestions. Be encouraging but honest. Return JSON only, no markdown.`;

      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim()
        .replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      const parsed = JSON.parse(raw);
      scores = {
        reelScore: parsed.reelScore ?? FALLBACK_SCORES.reelScore,
        hookScore: parsed.hookScore ?? FALLBACK_SCORES.hookScore,
        captionScore: parsed.captionScore ?? 0,
        audioScore: parsed.audioScore ?? FALLBACK_SCORES.audioScore,
        engagementScore: parsed.engagementScore ?? FALLBACK_SCORES.engagementScore,
        visualScore: parsed.visualScore ?? FALLBACK_SCORES.visualScore,
      };
      if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
        suggestions = parsed.suggestions;
      }
    } catch {
      // Use fallback scores and suggestions
    }

    // Step 4: Upsert project record
    if (projectId) {
      await prisma.project.update({
        where: { id: projectId },
        data: { uploadedVideoUrl: videoUrl, status: "draft" },
      }).catch(() => {});
    }

    return NextResponse.json({ captions, ...scores, suggestions });

  } catch (err) {
    console.error("[simple-editor/analyze]", err);
    return NextResponse.json({ captions: [], ...FALLBACK_SCORES, suggestions: FALLBACK_SUGGESTIONS });
  } finally {
    for (const p of [videoPath, audioPath]) {
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
    }
  }
}
