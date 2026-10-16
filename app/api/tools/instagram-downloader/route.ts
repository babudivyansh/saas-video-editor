import { createDownloaderRoute, safeTitle, videoHeights } from "@/lib/downloader-route";
import { instagramUrl, instagramFriendlyError } from "@/lib/downloader-urls";

export const maxDuration = 300;

const route = createDownloaderRoute({
  slug: "instagram-downloader",
  label: "Instagram downloader",
  filePrefix: "igdl",
  normalizeUrl: instagramUrl,
  invalidUrlMessage: "That isn't a link to a public Instagram post, reel or IGTV video.",
  infoBody(info) {
    const heights = videoHeights(info);
    const formats = heights.length
      ? heights.map((h) => ({ label: `${h}p`, quality: String(h) }))
      : [{ label: "Video (MP4)", quality: "best" }];
    formats.push({ label: "MP3 (audio only)", quality: "audio" });
    const caption = (info.title || info.description || "").trim();
    return {
      title: caption ? caption.substring(0, 120) : "Instagram video",
      author: info.uploader || info.uploader_id || info.channel || "",
      duration: info.duration ?? 0,
      thumbnail: info.thumbnail ?? "",
      viewCount: info.view_count ?? 0,
      likeCount: info.like_count ?? 0,
      formats,
    };
  },
  friendlyError: instagramFriendlyError,
  downloadBaseName: (info) => safeTitle(info.title || info.description || info.uploader || "", "instagram-video"),
});

export const { GET, POST, DELETE } = route;
