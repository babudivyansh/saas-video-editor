#!/usr/bin/env node
// Checks that every track in lib/music/catalog.ts exists in the bucket.
//
// Written because both create pages offered a dozen tracks that were not there:
// the bucket had no `music/` prefix at all, both render routes caught the
// download failure and continued, and the only trace was a logger.warn. A user
// picked a track, saw a waveform, and got a silent video.
//
// Read-only. Needs AWS credentials in the environment (the bucket denies
// anonymous reads, so an unauthenticated HEAD cannot tell "missing" from
// "forbidden" — which is why this uses the SDK rather than fetch).
//
// Run: node scripts/verify-music-assets.mjs

import { readFileSync } from "node:fs";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";

const envText = readFileSync(".env", "utf8");
const env = Object.fromEntries(
  envText.split(/\r?\n/).filter((l) => /^[A-Z_0-9]+=/.test(l)).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
  }),
);

const catalog = readFileSync("lib/music/catalog.ts", "utf8");
const slugs = [...catalog.matchAll(/\{ slug: "([a-z0-9-]+)"/g)].map((m) => m[1]);

const s3 = new S3Client({
  region: env.AWS_REGION,
  credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
});

let missing = 0;
for (const slug of slugs) {
  const Key = `music/${slug}.mp3`;
  try {
    const r = await s3.send(new HeadObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key }));
    console.log(`  ok      ${slug} (${Math.round((r.ContentLength ?? 0) / 1024)} KB)`);
  } catch {
    console.log(`  MISSING ${slug}`);
    missing++;
  }
}

console.log(`\n${slugs.length - missing}/${slugs.length} tracks present.`);
if (missing > 0) {
  console.log(
    "\nTracks a user can pick but that do not exist render as SILENCE — both\n" +
      "render routes catch the download failure and continue. Upload the files,\n" +
      "or mark the entries active: false in lib/music/catalog.ts.",
  );
  process.exit(1);
}
