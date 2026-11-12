import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { withRateLimit } from "@/lib/with-rate-limit";
import { rateLimit } from "@/lib/rate-limit";
import { downloadS3ObjectToBuffer } from "@/utils/s3-upload";
import sharp from "sharp";
import { screenPrompt } from "@/lib/photo-edit/policy";

// "Ideas for this photo": Gemini looks at the photo and proposes a few edits a
// creator would actually make to it. One small vision call (~$0.001), free,
// capped per day like the other free Gemini helpers.

const IDEAS_PER_DAY = 30;

const SYSTEM = `You suggest edits for a photo a content creator uploaded to an AI photo editor.
Return JSON only: {"suggestions": string[]} with exactly 4 items.
Each item is one concrete editing instruction, at most 18 words, written as the user would type it, e.g. "Replace the cluttered background with a clean studio backdrop".
Make them specific to what is in this photo: fix visible problems first (lighting, clutter, distractions), then creative changes useful for thumbnails and social posts.
Never suggest anything sexual, changing a person's body or ethnicity, or adding real public figures.`;

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!env.GEMINI_API_KEY) return NextResponse.json({ error: "Ideas aren't available right now." }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { assetId?: unknown };
  if (typeof body.assetId !== "string") return NextResponse.json({ error: "Choose a photo first." }, { status: 400 });
  const asset = await prisma.asset.findFirst({
    where: { id: body.assetId, userId: auth.userId, archivedAt: null, kind: "image" },
    select: { s3Key: true, size: true },
  });
  if (!asset) return NextResponse.json({ error: "That photo isn't in your Assets." }, { status: 404 });
  if (Number(asset.size) > 20 * 1024 * 1024) return NextResponse.json({ error: "This image is too large." }, { status: 400 });

  const cap = await rateLimit(`photoedit:ideas:${auth.userId}`, IDEAS_PER_DAY, 86400);
  if (!cap.allowed) return NextResponse.json({ error: `You've used today's ${IDEAS_PER_DAY} idea requests.` }, { status: 429 });

  try {
    // Ideas don't need detail: a 768px copy keeps the call fast and cheap.
    let small: Buffer;
    try {
      small = await sharp(await downloadS3ObjectToBuffer(asset.s3Key)).rotate().resize(768, 768, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    } catch {
      return NextResponse.json({ error: "We couldn't read this image." }, { status: 400 });
    }
    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash-lite",
      systemInstruction: SYSTEM,
      generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 400 },
    });
    const res = await model.generateContent(
      { contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: small.toString("base64") } }, { text: "Suggest 4 edits for this photo." }] }] },
      { timeout: 25_000 },
    );
    const parsed = JSON.parse(res.response.text()) as { suggestions?: unknown };
    const suggestions = (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .map((s) => s.trim().slice(0, 200))
      .filter((s) => screenPrompt(s).allowed)
      .slice(0, 4);
    return NextResponse.json({ suggestions });
  } catch (err) {
    logger.warn("photo-edit", "ideas failed", err);
    return NextResponse.json({ error: "No ideas right now. Try again in a moment." }, { status: 502 });
  }
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:photo-edit:suggest" });
