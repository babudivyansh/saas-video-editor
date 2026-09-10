import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { MUSIC_TRACKS, ACTIVE_MUSIC_TRACKS, musicUrl, musicTrackBySlug } from "./catalog";

describe("music catalog", () => {
  it("has a unique, url-safe slug for every track", () => {
    const slugs = MUSIC_TRACKS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("builds every URL through the one builder", () => {
    expect(musicUrl("lo-fi-chill")).toMatch(/\/lo-fi-chill\.mp3$/);
    // The bug this replaces: the key was the display name, lowercased. "I was
    // only temporary" and "3am Walk" are the entries where a name-derived key
    // and a real slug can drift apart.
    expect(musicUrl("i-was-only-temporary")).toMatch(/\/i-was-only-temporary\.mp3$/);
  });

  it("resolves a track by slug and hides inactive ones", () => {
    expect(musicTrackBySlug("bladerunner")?.name).toBe("Bladerunner");
    expect(musicTrackBySlug("nope")).toBeUndefined();
    expect(ACTIVE_MUSIC_TRACKS.every((t) => t.active !== false)).toBe(true);
  });

  it("is the only place a music URL is constructed", () => {
    // The consolidation is only worth anything if nothing rebuilds the URL by
    // hand. Both create pages used to; text-video derived the key by
    // slugifying the DISPLAY NAME, which 404'd silently for any mismatch.
    const roots = ["app", "lib", "utils"];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "node_modules" && e.name !== ".next") walk(p);
        } else if (/\.(ts|tsx)$/.test(e.name)) {
          const src = fs.readFileSync(p, "utf8");
          // lib/env.ts only DECLARES the var; it doesn't build a URL from it.
          const isAllowed =
            p.includes(path.join("lib", "music")) || p.endsWith(path.join("lib", "env.ts"));
          if (src.includes("MUSIC_BASE") && !isAllowed) {
            offenders.push(p);
          }
        }
      }
    };
    for (const r of roots) walk(path.join(process.cwd(), r));
    expect(offenders).toEqual([]);
  });
});
