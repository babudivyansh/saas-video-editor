import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getServerAuthUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { withRateLimit } from "@/lib/with-rate-limit";
import { attachmentDisposition } from "@/utils/content-disposition";
import { getPresignedDownloadUrl, sanitizeS3Key, verifyPresignedReadUrl } from "@/utils/s3-upload";

// GET /api/media/download?src=<media URL we handed out>&name=<file name>
//
// Every finished result (editor export, caption render, voiceover, dub, asset,
// zip, …) reaches the client as a presigned S3 URL. `<a download>` is ignored
// cross-origin, so a "Download" button pointing at one just navigated the tab
// to amazonaws.com and played the file. This route answers with a 302 to a
// fresh presigned URL carrying `response-content-disposition=attachment`, so
// the browser saves the file and the page never leaves Clipiro. Nothing is
// proxied — the bytes still come straight from S3.
//
// Authorisation is the URL itself: only a URL we signed (verified locally,
// unexpired) or one under our public CDN is accepted, and the redirect is to
// that same object — never to an arbitrary host (no open redirect).

function keyFromCdn(src: string): string | null {
  if (!env.CDN_BASE_URL) return null;
  const base = env.CDN_BASE_URL.replace(/\/$/, "") + "/";
  if (!src.startsWith(base)) return null;
  const key = sanitizeS3Key(decodeURIComponent(new URL(src).pathname.slice(new URL(base).pathname.length)));
  return key && !key.split("/").includes("..") ? key : null;
}

function safeFileName(name: string | null, key: string): string {
  const fallback = key.split("/").pop() || "download";
  const cleaned = (name ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "").trim().slice(0, 150);
  return cleaned || fallback;
}

async function handleGET(req: NextRequest) {
  // Opened by a plain anchor navigation: cookie, not Bearer.
  const auth = (await getAuthUser(req)) ?? (await getServerAuthUser());
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const src = searchParams.get("src");
  if (!src) return NextResponse.json({ error: "Missing src" }, { status: 400 });

  const key = (await verifyPresignedReadUrl(src)) ?? keyFromCdn(src);
  if (!key) {
    return NextResponse.json({ error: "This download link has expired — reload the page and try again." }, { status: 410 });
  }

  const url = await getPresignedDownloadUrl(key, attachmentDisposition(safeFileName(searchParams.get("name"), key)));
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
}

export const GET = withRateLimit(handleGET, {
  limit: 120, windowSec: 300, keyBy: "user", name: "media:download",
});
