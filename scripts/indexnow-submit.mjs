#!/usr/bin/env node
// Tell IndexNow engines (Bing, and through it Copilot and DuckDuckGo; also
// Yandex, Seznam, Naver) which URLs changed, instead of waiting for a recrawl.
//
//   npm run indexnow                       # every URL in the live sitemap
//   npm run indexnow -- /tools/auto-clip /pricing   # just these paths
//   npm run indexnow -- --dry-run          # print the payload, send nothing
//
// Run it after a deploy that changed public copy. The key below is public by
// design: IndexNow proves site ownership by fetching it back from
// https://clipiro.com/<key>.txt (public/<key>.txt), so rotating it means
// replacing that file too. Google does not take part in IndexNow; Search
// Console's sitemap covers it.

const HOST = "clipiro.com";
const KEY = "793453b63da62c70e4c6467318ec1c5d";
const ENDPOINT = "https://api.indexnow.org/indexnow";
// The protocol caps one submission at 10,000 URLs.
const MAX_URLS = 10_000;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const paths = args.filter((a) => !a.startsWith("--"));

async function sitemapUrls() {
  const res = await fetch(`https://${HOST}/sitemap.xml`);
  if (!res.ok) throw new Error(`sitemap.xml returned ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

const urlList = (paths.length > 0 ? paths.map((p) => new URL(p, `https://${HOST}`).href) : await sitemapUrls()).slice(
  0,
  MAX_URLS,
);

const body = { host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList };

if (dryRun) {
  console.log(JSON.stringify(body, null, 2));
  process.exit(0);
}

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});
// 200 = accepted, 202 = accepted but the key is still being verified.
if (res.status === 200 || res.status === 202) {
  console.log(`IndexNow accepted ${urlList.length} URL(s) (HTTP ${res.status}).`);
} else {
  console.error(`IndexNow rejected the submission: HTTP ${res.status} ${await res.text()}`);
  process.exit(1);
}
