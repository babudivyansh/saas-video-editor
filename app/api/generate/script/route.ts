import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { generateScript } from "@/utils/gemini";

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { topic, style } = await req.json();
  if (!topic) return NextResponse.json({ error: "topic required" }, { status: 400 });

  try {
    const result = await generateScript(topic, style ?? "engaging and informative");
    return NextResponse.json(result);
  } catch (err) {
    console.error("[generate/script]", err);
    return NextResponse.json({ error: "Script generation failed" }, { status: 500 });
  }
}
