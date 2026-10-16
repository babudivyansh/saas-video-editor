// URL checks and user-facing errors for the two downloaders
// (lib/downloader-route.ts). Kept apart from the route files so they can be
// tested: a Next route module may only export its handlers and config.

// 11-character video IDs only: anything else is not a YouTube video, and the
// ID is the only part of the input that reaches yt-dlp.
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** The canonical watch URL for a YouTube link, or null if it isn't one. */
export function youtubeUrl(raw: string): string | null {
  const patterns = [/[?&]v=([^&#]+)/, /youtu\.be\/([^?&#/]+)/, /shorts\/([^?&#/]+)/, /embed\/([^?&#/]+)/, /live\/([^?&#/]+)/];
  for (const p of patterns) {
    const m = raw.match(p);
    if (m?.[1] && VIDEO_ID.test(m[1])) return `https://www.youtube.com/watch?v=${m[1]}`;
  }
  return null;
}

export function youtubeFriendlyError(raw: string): string {
  if (/sign in to confirm|bot/i.test(raw)) return "YouTube is blocking downloads from our server right now. Please try again later.";
  if (/private|members-only|age|login|sign in/i.test(raw)) return "This video is private, age-restricted or members-only, so it can't be downloaded.";
  if (/unavailable|not available|removed|does not exist/i.test(raw)) return "This video is unavailable.";
  return "We couldn't download this video. Please try again.";
}

// Public posts, reels and IGTV on instagram.com / instagr.am only. Stories are
// left out: they always need a logged-in session, so they can only fail.
const IG_POST_PATH = /^\/(?:[A-Za-z0-9_.]+\/)?(?:p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?$/;

/** A clean link to a public Instagram post, or null if it isn't one. */
export function instagramUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!/^(www\.)?(instagram\.com|instagr\.am)$/i.test(u.hostname)) return null;
  if (!IG_POST_PATH.test(u.pathname)) return null;
  // Strip query/hash so the extractor gets a clean shortcode link.
  return `https://www.instagram.com${u.pathname}`;
}

export function instagramFriendlyError(raw: string): string {
  if (/login required|rate-limit|429|empty media response|not available|private/i.test(raw)) {
    return "This post is private or Instagram is limiting requests. Only public posts and reels can be downloaded — please try again shortly.";
  }
  return "We couldn't download this post. Please try again.";
}
