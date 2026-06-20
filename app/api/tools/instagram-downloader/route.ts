import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { create as createYoutubeDl } from "youtube-dl-exec";
import ffmpegStatic from "ffmpeg-static";
import fs from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";

export const maxDuration = 300;

// ── yt-dlp binary (bundled by youtube-dl-exec) ────────────────────────────────
const YT_DLP_BIN = path.join(
  process.cwd(),
  "node_modules",
  "youtube-dl-exec",
  "bin",
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"
);
const ytDlp = createYoutubeDl(YT_DLP_BIN);

// ── ffmpeg binary for merging/audio extraction ────────────────────────────────
function resolveFfmpegDir(): string | undefined {
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return path.dirname(ffmpegStatic);
  const bin = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const cwdPath = path.join(process.cwd(), "node_modules", "ffmpeg-static", bin);
  if (fs.existsSync(cwdPath)) return path.dirname(cwdPath);
  return undefined;
}
const FFMPEG_DIR = resolveFfmpegDir();

const Q_ORDER = [2160, 1440, 1080, 720, 480, 360, 240, 144];

// Accepts post / reel / reels / tv / igtv / stories URLs.
function isInstagramUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?(instagram\.com|instagr\.am)\/(p|reel|reels|tv|stories|[A-Za-z0-9_.]+\/(p|reel|reels|tv))?/i.test(
    url
  );
}

// Normalise the URL: strip query/hash so the extractor gets a clean shortcode link.
function cleanInstagramUrl(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

function safeTitle(title: string): string {
  return title.replace(/[^\w\s-]/g, "").trim().substring(0, 80) || "instagram-video";
}

interface IgFormat {
  height?: number | null;
  vcodec?: string | null;
  acodec?: string | null;
}
interface IgInfo {
  title?: string;
  description?: string;
  duration?: number;
  uploader?: string;
  uploader_id?: string;
  channel?: string;
  thumbnail?: string;
  view_count?: number;
  like_count?: number;
  formats?: IgFormat[];
}

// Stream a finished file back to the client, then delete it.
function streamFileResponse(filePath: string, contentType: string, downloadName: string): Response {
  const nodeStream = fs.createReadStream(filePath);
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk) =>
        controller.enqueue(new Uint8Array(chunk as Buffer))
      );
      nodeStream.on("end", () => {
        controller.close();
        fs.promises.unlink(filePath).catch(() => {});
      });
      nodeStream.on("error", (err) => {
        controller.error(err);
        fs.promises.unlink(filePath).catch(() => {});
      });
    },
    cancel() {
      nodeStream.destroy();
      fs.promises.unlink(filePath).catch(() => {});
    },
  });

  const safeName = downloadName.replace(/[^a-zA-Z0-9._\- ]/g, "_");
  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "no-store",
    },
  });
}

// ── GET handler ───────────────────────────────────────────────────────────────
// GET ?url=...&action=info    → JSON metadata + available formats
// GET ?url=...&quality=720    → MP4 (merged)
// GET ?url=...&quality=audio  → MP3
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const rawUrl  = searchParams.get("url")?.trim() ?? "";
  const action  = searchParams.get("action");
  const quality = searchParams.get("quality") ?? "best";

  if (!isInstagramUrl(rawUrl)) {
    return NextResponse.json({ error: "Invalid or unsupported Instagram URL" }, { status: 400 });
  }
  const cleanUrl = cleanInstagramUrl(rawUrl);

  // ── Info mode ───────────────────────────────────────────────────────────────
  if (action === "info") {
    try {
      const info = (await ytDlp(cleanUrl, {
        dumpSingleJson: true,
        noWarnings: true,
        noCheckCertificates: true,
        noPlaylist: true,
      })) as unknown as IgInfo;

      const heights = [
        ...new Set(
          (info.formats ?? [])
            .filter(f => f.vcodec && f.vcodec !== "none" && f.height)
            .map(f => f.height as number)
        ),
      ].sort((a, b) => Q_ORDER.indexOf(a) - Q_ORDER.indexOf(b));

      const formats: { label: string; quality: string }[] = heights.length
        ? heights.map(h => ({ label: `${h}p MP4`, quality: String(h) }))
        : [{ label: "Video (MP4)", quality: "best" }];
      formats.push({ label: "MP3 (Audio Only)", quality: "audio" });

      const caption = (info.title || info.description || "").trim();

      return NextResponse.json({
        title: caption ? caption.substring(0, 120) : "Instagram Video",
        author: info.uploader || info.uploader_id || info.channel || "",
        duration: info.duration ?? 0,
        thumbnail: info.thumbnail ?? "",
        viewCount: info.view_count ?? 0,
        likeCount: info.like_count ?? 0,
        formats,
      });
    } catch (err) {
      const e = err as { stderr?: string; message?: string };
      const msg = e.stderr?.split("\n").find(l => l.includes("ERROR")) ?? e.message ?? "Failed to fetch post info";
      console.error("[ig-dl info]", e.stderr ?? msg);
      return NextResponse.json(
        { error: cleanErr(msg) },
        { status: 500 }
      );
    }
  }

  // ── Download mode ─────────────────────────────────────────────────────────────
  const jobId = randomUUID();
  const isAudio = quality === "audio";
  const ext = isAudio ? "mp3" : "mp4";
  const outTemplate = path.join(os.tmpdir(), `igdl_${jobId}.%(ext)s`);
  const finalPath = path.join(os.tmpdir(), `igdl_${jobId}.${ext}`);

  try {
    // Resolve a nice filename from the caption/uploader.
    const meta = (await ytDlp(cleanUrl, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificates: true,
      noPlaylist: true,
    })) as unknown as IgInfo;
    const baseName =
      safeTitle(meta.title || meta.description || meta.uploader || "instagram-video");

    if (isAudio) {
      await ytDlp(cleanUrl, {
        format: "bestaudio/best",
        extractAudio: true,
        audioFormat: "mp3",
        audioQuality: 0,
        output: outTemplate,
        ffmpegLocation: FFMPEG_DIR,
        noWarnings: true,
        noCheckCertificates: true,
        noPlaylist: true,
      });
    } else {
      const h = /^\d+$/.test(quality) ? quality : "9999";
      await ytDlp(cleanUrl, {
        format: `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`,
        mergeOutputFormat: "mp4",
        output: outTemplate,
        ffmpegLocation: FFMPEG_DIR,
        noWarnings: true,
        noCheckCertificates: true,
        noPlaylist: true,
      });
    }

    if (!fs.existsSync(finalPath)) {
      // Fall back: find whatever file yt-dlp actually produced for this job.
      const dir = os.tmpdir();
      const produced = fs.readdirSync(dir).find(f => f.startsWith(`igdl_${jobId}.`));
      if (!produced) {
        return NextResponse.json({ error: "Download produced no output file" }, { status: 500 });
      }
      const producedPath = path.join(dir, produced);
      const ct = isAudio ? "audio/mpeg" : "video/mp4";
      return streamFileResponse(producedPath, ct, `${baseName}.${ext}`);
    }

    const contentType = isAudio ? "audio/mpeg" : "video/mp4";
    return streamFileResponse(finalPath, contentType, `${baseName}.${ext}`);
  } catch (err) {
    // Clean up any partial files.
    try {
      const dir = os.tmpdir();
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith(`igdl_${jobId}.`)) {
          fs.promises.unlink(path.join(dir, f)).catch(() => {});
        }
      }
    } catch { /* ignore cleanup errors */ }

    const e = err as { stderr?: string; message?: string };
    const stderrLine = e.stderr?.split("\n").find(l => l.includes("ERROR"));
    const msg = stderrLine ?? e.message ?? "Download failed";
    console.error("[ig-dl]", e.stderr ?? msg);
    return NextResponse.json({ error: cleanErr(msg) }, { status: 500 });
  }
}

// Make yt-dlp errors friendlier for the end user.
function cleanErr(raw: string): string {
  const msg = raw.replace(/^ERROR:\s*/, "").trim();
  if (/login required|rate-limit|429|empty media response|not available|private/i.test(msg)) {
    return "This post is private or Instagram is rate-limiting requests. Only public posts and reels can be downloaded — please try again shortly.";
  }
  return msg || "Download failed";
}
