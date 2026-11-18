// Where AutoClip can import a source video from by link. Its own entry point
// (@clipiro/shared/sources) so a web client component can read the label
// without pulling in the zod schemas and API client behind the package root.
//
// Server-side this is the SSRF allowlist for lib/url-import.ts: https only,
// exact host match, no subdomain wildcards.

export const SOURCE_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "music.youtube.com",
  "vimeo.com",
  "player.vimeo.com",
  "drive.google.com",
  "docs.google.com",
  "dropbox.com",
  "www.dropbox.com",
  "loom.com",
  "www.loom.com",
  // Twitch past broadcasts, highlights and clips. A live channel probes as
  // is_live and is refused with its own message (lib/url-import.ts).
  "twitch.tv",
  "www.twitch.tv",
  "m.twitch.tv",
  "clips.twitch.tv",
] as const;

/** The supported sources, as one phrase for error and helper copy. */
export const SOURCE_HOSTS_LABEL = "YouTube, Twitch, Vimeo, Loom, Google Drive or Dropbox";

export function isAllowedSourceUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" && (SOURCE_HOSTS as readonly string[]).includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

