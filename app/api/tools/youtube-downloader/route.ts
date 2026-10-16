import { createDownloaderRoute, safeTitle, videoHeights } from "@/lib/downloader-route";
import { youtubeUrl, youtubeFriendlyError } from "@/lib/downloader-urls";

export const maxDuration = 300;

const route = createDownloaderRoute({
  slug: "youtube-downloader",
  label: "YouTube downloader",
  filePrefix: "ytdl",
  normalizeUrl: youtubeUrl,
  invalidUrlMessage: "That isn't a YouTube video link.",
  infoBody(info) {
    const formats = videoHeights(info).map((h) => ({ label: `${h}p`, quality: String(h) }));
    formats.push({ label: "MP3 (audio only)", quality: "audio" });
    return {
      title: info.title ?? "Untitled",
      author: info.uploader ?? info.channel ?? "",
      duration: info.duration ?? 0,
      thumbnail: info.thumbnail ?? "",
      viewCount: info.view_count ?? 0,
      likeCount: info.like_count ?? 0,
      formats,
    };
  },
  friendlyError: youtubeFriendlyError,
  downloadBaseName: (info) => safeTitle(info.title ?? "", "video"),
});

export const { GET, POST, DELETE } = route;
