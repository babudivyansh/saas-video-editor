import "dotenv/config";
import https from "https";
import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { uploadFileToS3, getPresignedUrl, deleteS3Object } from "../utils/s3-upload";
import { freshSourceUrl, classifySource } from "../lib/source-url";
import { runFFmpegArgs, encodeArgs, probeMediaDuration, styleIndexToDrawtext } from "../utils/ffmpeg-render";
import { streamerFontFile } from "../utils/ffmpeg-render";

/**
 * Production media-flow smoke harness.
 *
 * Exists because the Split Screen and Streamer stale-source gates could not be
 * closed by observation: production has never contained a project of either
 * type, so there was nothing old to verify against. This manufactures the
 * scenario safely and repeatably instead.
 *
 *   npm run verify:production-media-flows
 *
 * ── What runs without any credentials ──────────────────────────────────────
 * The STORAGE section proves the actual defect end to end against production
 * S3: upload synthetic media, mint a deliberately 2-second grant, let it
 * genuinely expire (403 "Request has expired" — the exact production failure),
 * then prove the deployed resolver recovers the durable key, re-mints, and
 * refetches the identical bytes. It also proves a second tenant is refused for
 * that same real object. Everything it creates is deleted at the end.
 *
 * No database write. No account creation. No customer object. Ownership rides
 * on the path-prefix proof, which `ownsKey()` accepts without consulting the
 * User table, so a synthetic owner id suffices and nothing persistent exists.
 *
 * ── What needs a QA session ────────────────────────────────────────────────
 * The RENDER section drives the real production endpoints, which authenticate
 * with a session JWT (`getAuthUser`) — API keys are only accepted on /api/v1.
 * Obtain one by signing in as your internal QA account and copying the token,
 * then:
 *
 *   CLIPIRO_QA_SESSION_TOKEN=<token> CLIPIRO_BASE_URL=https://clipiro.com \
 *     npm run verify:production-media-flows
 *
 * Never point this at a real customer account: it spends credits and creates
 * projects. Use a dedicated QA tenant.
 */

const BASE = process.env.CLIPIRO_BASE_URL ?? "https://clipiro.com";

/**
 * The QA session token, from the env var or — preferably — a file.
 *
 * The file form exists because a token pasted into a chat, a shell history or
 * a CI log is a token you have to rotate. Write it to a file outside the repo,
 * point this at it, and delete the file afterwards; it never appears in an
 * argument list, an environment dump or a transcript.
 */
function readToken(): string {
  const file = process.env.CLIPIRO_QA_SESSION_TOKEN_FILE;
  if (file) {
    try {
      return fs.readFileSync(file, "utf8").trim();
    } catch (e) {
      console.error(`could not read CLIPIRO_QA_SESSION_TOKEN_FILE: ${(e as Error).message}`);
      return "";
    }
  }
  return (process.env.CLIPIRO_QA_SESSION_TOKEN ?? "").trim();
}
const TOKEN = readToken();
const KEEP = process.argv.includes("--keep");
const tmp = os.tmpdir();

let failures = 0;
const ok = (name: string, detail = "") => console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
const bad = (name: string, detail = "") => { failures++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); };
const check = (cond: boolean, name: string, detail = "") => (cond ? ok(name, detail) : bad(name, detail));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Never let a signature reach a log or a report. */
const redact = (u: string) => `${u.split("?")[0].replace(/\/uploads\/[^/]+\//, "/uploads/<owner>/")}?<signature redacted>`;

function fetchUrl(url: string): Promise<{ status: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c as Buffer));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }));
    }).on("error", reject);
  });
}

async function api(method: string, route: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, json };
}

/** 8s of moving colour plus a tone — enough to render, small enough to be cheap. */
async function makeSyntheticMedia(): Promise<string> {
  const out = path.join(tmp, `clipiro-qa-synth-${Date.now()}.mp4`);
  await runFFmpegArgs([
    "-y",
    "-f", "lavfi", "-i", "testsrc=size=720x1280:rate=25:duration=8",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=8",
    ...encodeArgs(), "-shortest", out,
  ], 180_000);
  return out;
}

// ── SECTION 1: storage / stale source (no credentials required) ─────────────

async function verifyStaleSource(mediaPath: string): Promise<void> {
  console.log("\n[1] Stale source re-mint against production S3");

  const owner = `qa-smoke-${randomUUID()}`;
  const other = `qa-other-${randomUUID()}`;
  const key = `uploads/${owner}/clipiro-qa-stale-${Date.now()}.mp4`;
  const localBytes = fs.statSync(mediaPath).size;

  await uploadFileToS3(mediaPath, key, "video/mp4");
  ok("synthetic media uploaded to production S3", `${localBytes} bytes`);

  // Compress the six-hour wait into two seconds. Same mechanism, same failure.
  const shortLived = await getPresignedUrl(key, 2);
  const live = await fetchUrl(shortLived);
  check(live.status === 200 && live.body.length === localBytes, "grant works before expiry", `HTTP ${live.status}`);

  await sleep(5000);
  const dead = await fetchUrl(shortLived);
  const expired = dead.status === 403 && /Request has expired/i.test(dead.body.toString("utf8"));
  check(expired, "grant is genuinely expired", `HTTP ${dead.status} "Request has expired"`);

  const cls = await classifySource(shortLived, owner);
  check(cls.kind === "owned", "owner's source classifies as owned", `kind=${cls.kind}`);

  const fresh = await freshSourceUrl(shortLived, owner);
  check(fresh !== shortLived, "expired grant is re-minted, not reused", redact(fresh));

  const recovered = await fetchUrl(fresh);
  check(recovered.status === 200 && recovered.body.length === localBytes,
    "source recovered with the fresh grant", `HTTP ${recovered.status}, ${recovered.body.length}/${localBytes} bytes`);

  // Tenant control against a REAL production object.
  const foreignUrl = await freshSourceUrl(shortLived, other);
  check(foreignUrl === shortLived, "a different tenant is refused for the same object", "no grant issued");

  if (!KEEP) {
    await deleteS3Object(key);
    const gone = await fetchUrl(fresh);
    check(gone.status === 404 || gone.status === 403, "QA object cleaned up", `HTTP ${gone.status}`);
  }
}

// ── SECTION 2: font resolution (no credentials; uses the local runtime) ─────
// On the production host this reports what production actually resolves, which
// is the open question: if every style lands on the bundled fallback, the
// styles are reliable but not the intended typefaces.

function verifyFontMatrix(): void {
  console.log("\n[2] Streamer font resolution (as seen by THIS host)");
  const families = new Map<string, string>();
  for (let i = 0; i < 16; i++) {
    const { fontname } = styleIndexToDrawtext(i);
    families.set(fontname, streamerFontFile(fontname));
  }
  const bundled = (p: string) => p.replace(/\\/g, "/").includes("/public/fonts/");
  for (const [family, file] of families) {
    const exists = fs.existsSync(file);
    console.log(`  ${family.padEnd(18)} -> ${exists ? "" : "MISSING "}${file}${bundled(file) ? "  [bundled fallback]" : "  [system font]"}`);
    if (!exists) bad(`font file for ${family}`, file);
  }
  const distinct = new Set(families.values()).size;
  check(distinct > 1, "styles resolve to more than one typeface",
    distinct === 1 ? "ALL styles collapsed onto ONE face — intended-font status is FAILED/OPEN" : `${distinct} distinct files`);
}

/** Render the same title in several styles and extract the title frame from each. */
async function renderFontSamples(mediaPath: string): Promise<void> {
  console.log("\n[3] Font control experiment (A/A/B/C)");
  const { runStreamerFFmpeg } = await import("../utils/ffmpeg-render");
  const cases: { label: string; style: number }[] = [
    { label: "A1", style: 0 }, { label: "A2", style: 0 },
    { label: "B", style: 2 }, { label: "C", style: 7 },
  ];
  const frames: Record<string, string> = {};
  for (const c of cases) {
    const out = path.join(tmp, `clipiro-qa-font-${c.label}.mp4`);
    await runStreamerFFmpeg({
      userVideoPath: mediaPath, titleText: "Clipiro QA",
      drawtextOpts: styleIndexToDrawtext(c.style), outputPath: out,
    });
    const frame = path.join(tmp, `clipiro-qa-font-${c.label}.png`);
    // Same timestamp, cropped to the title band, so the comparison is glyphs only.
    await runFFmpegArgs(["-y", "-i", out, "-vf", "crop=iw:ih*0.22:0:0", "-frames:v", "1", frame], 120_000);
    frames[c.label] = frame;
    const { fontname } = styleIndexToDrawtext(c.style);
    console.log(`  ${c.label}: style ${c.style} (${fontname}) -> ${path.basename(frame)}`);
  }
  const read = (l: string) => fs.readFileSync(frames[l]);
  check(read("A1").equals(read("A2")), "control: same style twice is identical",
    "if this fails, any A/B difference proves nothing");
  check(!read("A1").equals(read("B")), "different intended family renders different glyphs");
  check(!read("A1").equals(read("C")), "third family renders different glyphs");
  console.log(`  title frames written to ${tmp} — inspect them to confirm the typefaces by eye`);
}

// ── SECTION 3: authenticated production flows (needs a QA session) ──────────

async function verifyRenderFlows(mediaPath: string): Promise<void> {
  console.log("\n[4] Authenticated production render flows");
  if (!TOKEN) {
    // Distinguish "not attempted" from "attempted and lost the value" — a
    // shell `read` that hit EOF exports an empty string, which looks the same
    // as never setting it unless we say so.
    if ("CLIPIRO_QA_SESSION_TOKEN" in process.env || "CLIPIRO_QA_SESSION_TOKEN_FILE" in process.env) {
      bad("QA session token is set but EMPTY",
        "a `read` prompt that got EOF, or an unset that ran too early — the render flows did NOT run");
    } else {
      console.log("  SKIPPED — set CLIPIRO_QA_SESSION_TOKEN to a dedicated QA account's session token.");
    }
    console.log("  These endpoints use session auth (getAuthUser); API keys are only accepted on /api/v1.");
    return;
  }

  // Fail fast and loudly rather than spending credits on the wrong tenant.
  const who = await api("GET", "/api/auth/me");
  if (who.status !== 200) {
    bad("QA session token rejected", `GET /api/auth/me -> HTTP ${who.status}`);
    return;
  }
  const me = (who.json.user ?? who.json) as { email?: string; credits?: number };
  const email = me.email ?? "(unknown)";
  console.log(`  authenticated as ${email.replace(/^(.{4}).*(@.*)$/, "$1***$2")} — credits=${me.credits ?? "?"}`);
  console.log("  NOTE: this run creates projects and spends credits on THIS account. It must be a QA tenant.");

  const owner = `qa-smoke-${randomUUID()}`;
  const key = `uploads/${owner}/clipiro-qa-render-${Date.now()}.mp4`;
  await uploadFileToS3(mediaPath, key, "video/mp4");
  const expiring = await getPresignedUrl(key, 2);
  await sleep(5000);
  ok("QA source uploaded and its grant expired");

  for (const surface of ["split-screen", "streamer-video"] as const) {
    const created = await api("POST", "/api/projects", {
      title: `QA smoke ${surface} ${new Date().toISOString()}`,
      productType: surface,
      uploadedVideoUrl: expiring, // the expired grant — the state under test
    });
    if (created.status >= 300) { bad(`${surface}: create project`, `HTTP ${created.status}`); continue; }
    const projectId = (created.json.project as { id?: string })?.id ?? created.json.id;
    ok(`${surface}: QA project created`, String(projectId));

    const body = surface === "split-screen"
      ? { projectId, bgVideoUrl: "https://cdn.clipiro.com/backgrounds/minecraft.mp4", subtitleStyleIndex: 0, mode: "oneword" }
      : { projectId, titleText: "Clipiro QA", subtitleStyleIndex: 0 };
    const started = await api("POST", `/api/generate/${surface}`, body);
    check(started.status === 200, `${surface}: render accepted`, `HTTP ${started.status}`);
    if (started.status !== 200) continue;

    // Poll for completion.
    let status = "rendering", failureReason: string | null = null, videoUrl: string | null = null;
    for (let i = 0; i < 60 && status === "rendering"; i++) {
      await sleep(5000);
      const p = await api("GET", `/api/projects/${projectId}`);
      const proj = (p.json.project ?? p.json) as { status?: string; failureReason?: string | null; videoUrl?: string | null };
      status = proj.status ?? status;
      failureReason = proj.failureReason ?? null;
      videoUrl = proj.videoUrl ?? null;
    }
    check(status === "completed", `${surface}: completed`, `status=${status}${failureReason ? ` reason="${failureReason}"` : ""}`);
    check(!failureReason, `${surface}: failureReason is null`, failureReason ?? "null");

    if (videoUrl) {
      const out = path.join(tmp, `clipiro-qa-${surface}-out.mp4`);
      const dl = await fetchUrl(videoUrl);
      fs.writeFileSync(out, dl.body);
      check(dl.status === 200 && dl.body.length > 10_000, `${surface}: output downloads`, `${dl.body.length} bytes`);
      const probe = await probeMediaDuration(out);
      check(probe.durationSec !== null, `${surface}: output is a valid, probeable MP4`, `duration=${probe.durationSec}s`);
    }
  }

  if (!KEEP) await deleteS3Object(key);
}

async function main() {
  console.log("Clipiro production media-flow verification");
  console.log(`base=${BASE} session=${TOKEN ? "provided" : "absent (render flows will skip)"}`);

  const media = await makeSyntheticMedia();
  try {
    await verifyStaleSource(media);
    verifyFontMatrix();
    await renderFontSamples(media);
    await verifyRenderFlows(media);
  } finally {
    if (!KEEP) { try { fs.unlinkSync(media); } catch { /* best effort */ } }
  }

  // Never report a bare "all passed" when the render flows did not run. An
  // empty CLIPIRO_QA_SESSION_TOKEN (a `read` that hit EOF, an unset that fired
  // early) would otherwise skip section 4 silently and still look green, which
  // is exactly the kind of false pass this harness exists to prevent.
  const scope = TOKEN ? "storage + render flows" : "STORAGE ONLY — render flows skipped, no session token";
  console.log(`\nScope: ${scope}`);
  console.log(failures === 0 ? "ALL EXECUTED CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
  if (!TOKEN) {
    console.log("Split Screen / Streamer / preview-frames remain UNVERIFIED — this run does not close those gates.");
  }
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => { console.error("harness failed:", e instanceof Error ? e.message : e); process.exitCode = 1; });
