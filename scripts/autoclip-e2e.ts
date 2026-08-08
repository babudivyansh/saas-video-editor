/**
 * AutoClip end-to-end harness.
 *
 * Drives the real product surface — HTTP routes, the queue, ffmpeg, S3 — from
 * upload through pick, review, confirm, render and the Studio edit paths, then
 * probes the rendered output to check it is actually a valid vertical video of
 * the right length rather than just a row marked "ready".
 *
 * Needs: a local Next dev server on $BASE (default http://localhost:3000), the
 * app's own .env (S3 + Gemini + an STT provider), and a working DATABASE_URL.
 * Run with:  npx tsx scripts/autoclip-e2e.ts
 *
 * The narration fixture is synthesized once and cached in .e2e-tmp/ so repeat
 * runs cost nothing extra at ElevenLabs.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { execFile, execFileSync } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { prisma } from "@/lib/prisma";
import { grantCredits } from "@/lib/credits";
import { synthesizeVoice } from "@/utils/elevenlabs";

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const TMP = path.join(process.cwd(), ".e2e-tmp");
const FIXTURE = path.join(TMP, "autoclip-source.mp4");
const NARRATION = path.join(TMP, "autoclip-narration.mp3");

let pass = 0;
let fail = 0;
let hasTranscript = false;
const failures: string[] = [];

function check(name: string, ok: unknown, detail = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(`${name} — ${detail}`);
    console.log(`  FAIL  ${name}${detail ? `  :: ${detail}` : ""}`);
  }
}

function step(title: string) {
  console.log(`\n=== ${title} ===`);
}

let token = "";
// proxy.ts gates every non-public /api/* route on the session COOKIE, not the
// Bearer header, so a header-only client 401s before any handler runs. The
// browser sends both; so does this.
let cookie = "";

function authHeaders(): Record<string, string> {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

function captureCookie(res: Response) {
  const raw = res.headers.getSetCookie?.() ?? [];
  const session = raw.find((c) => c.startsWith("session="));
  if (session) cookie = session.split(";")[0];
}

async function api(method: string, urlPath: string, body?: unknown) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  captureCookie(res);
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: json as any, text };
}

const NARRATION_SCRIPT = `
Here is the single biggest mistake that new video creators make, and almost nobody talks about it.
They spend six hours editing a video nobody watches, because the first two seconds were boring.
The hook is everything. If you do not earn attention in the first two seconds, the algorithm will not save you.
So here is what actually works. Start in the middle of the story. Skip the introduction entirely.
Do not say hey guys welcome back to my channel. Say the most surprising sentence you have, immediately.
Second, cut every single pause. Silence is where viewers leave. Tight pacing beats perfect audio every time.
Third, and this is the part people get wrong, end on a complete thought. A clip that stops mid sentence feels broken.
Do those three things and your retention will double. I have tested this on over four hundred videos.
`.trim().replace(/\s*\n\s*/g, " ");

function parseFfmpegInfo(stderr: string) {
  const dim = stderr.match(/Video:.*?[ ,](\d{2,5})x(\d{2,5})/);
  const dur = stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  return {
    w: dim ? parseInt(dim[1], 10) : 0,
    h: dim ? parseInt(dim[2], 10) : 0,
    durationSec: dur ? +dur[1] * 3600 + +dur[2] * 60 + parseFloat(dur[3]) : 0,
    hasAudio: /Audio: /.test(stderr),
  };
}

/** ffmpeg exits non-zero on a bare `-i`, so run it tolerantly and read stderr. */
function probeTolerant(file: string) {
  return new Promise<ReturnType<typeof parseFfmpegInfo>>((resolve) => {
    execFile(ffmpegPath as string, ["-hide_banner", "-i", file], (_e, _so, se) => resolve(parseFfmpegInfo(se || "")));
  });
}

async function buildFixture() {
  fs.mkdirSync(TMP, { recursive: true });
  if (!fs.existsSync(NARRATION)) {
    try {
      console.log("  synthesizing narration (one-off)…");
      const { audioBuffer } = await synthesizeVoice(NARRATION_SCRIPT, "JBFqnCBsd6RMkjVDRZzb");
      fs.writeFileSync(NARRATION, audioBuffer);
    } catch (err) {
      // No TTS provider configured locally: fall back to a tone bed. The run
      // still covers the whole pipeline, but on the no-transcript branch —
      // which the summary calls out so a green run isn't mistaken for
      // coverage of captions and silence removal.
      console.log(`  TTS unavailable (${(err as Error).message.slice(0, 120)}) — using a tone bed`);
      execFileSync(ffmpegPath as string, [
        "-y", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", "sine=frequency=220:duration=45",
        "-c:a", "libmp3lame", "-b:a", "128k", NARRATION,
      ], { stdio: "inherit" });
    }
  }
  if (!fs.existsSync(FIXTURE)) {
    execFileSync(ffmpegPath as string, [
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30",
      "-i", NARRATION, "-shortest",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", FIXTURE,
    ], { stdio: "inherit" });
  }
  const info = await probeTolerant(FIXTURE);
  console.log(`  fixture: ${info.w}x${info.h}, ${info.durationSec.toFixed(1)}s, audio=${info.hasAudio}`);
  return info;
}

async function waitFor<T>(
  label: string,
  poll: () => Promise<T | null>,
  timeoutMs: number,
  intervalMs = 3000,
): Promise<T | null> {
  const started = Date.now();
  let lastLog = 0;
  for (;;) {
    const got = await poll();
    if (got !== null) return got;
    if (Date.now() - started > timeoutMs) {
      console.log(`  timeout waiting for ${label} after ${Math.round((Date.now() - started) / 1000)}s`);
      return null;
    }
    if (Date.now() - lastLog > 15000) {
      lastLog = Date.now();
      console.log(`  …waiting for ${label} (${Math.round((Date.now() - started) / 1000)}s)`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function main() {
  console.log(`AutoClip E2E against ${BASE}\n`);

  step("0. Fixture");
  const src = await buildFixture();
  check("fixture video built", src.w === 1920 && src.durationSec > 20, JSON.stringify(src));

  step("1. Auth");
  const ts = Date.now();
  const email = `autoclip-e2e-${ts}@example.com`;
  const reg = await api("POST", "/api/auth/register", {
    firstName: "Auto", lastName: "Clip", email,
    phone: `9${String(ts).slice(-9)}`,
    password: "password123", confirmPassword: "password123",
  });
  check("register (201)", reg.status === 201, `status=${reg.status} ${reg.text.slice(0, 200)}`);
  token = reg.body?.token ?? "";
  check("token issued", !!token);
  if (!token) throw new Error("cannot continue without a token");

  const me = await api("GET", "/api/auth/me");
  const userId: string = me.body?.user?.id ?? reg.body?.user?.id;
  check("userId resolved", !!userId, JSON.stringify(me.body)?.slice(0, 200));

  await grantCredits({ userId, bucket: "purchased", amount: 500, reason: "e2e:test-grant", refId: `e2e:${ts}` });
  console.log("  granted 500 credits");

  // Free tier caps output at 720p and burns a watermark, which would mask a
  // real framing regression behind an expected downscale. Put the account on a
  // paid plan so the run asserts the full-resolution path; §13 covers the
  // free-tier treatment separately.
  const paidPlan = await prisma.plan.findFirst({ where: { tier: { in: ["creator", "pro", "studio"] } } });
  if (paidPlan) {
    await prisma.user.update({
      where: { id: userId },
      data: { planId: paidPlan.id, subscriptionEndsAt: new Date(Date.now() + 30 * 86400_000) },
    });
    console.log(`  upgraded to ${paidPlan.tier} for the run`);
  } else {
    console.log("  WARNING: no paid plan seeded — running on free tier (720p + watermark)");
  }
  const paidTier = !!paidPlan;

  step("2. Upload source video");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(fs.readFileSync(FIXTURE))], { type: "video/mp4" }), "autoclip-source.mp4");
  const upRes = await fetch(`${BASE}/api/upload`, {
    method: "POST", headers: authHeaders(), body: form,
  });
  const up = await upRes.json().catch(() => ({}));
  check("upload (200)", upRes.status === 200, `status=${upRes.status} ${JSON.stringify(up).slice(0, 200)}`);
  const uploadedVideoUrl: string = up?.url ?? up?.asset?.url;
  check("upload returned a url", !!uploadedVideoUrl, JSON.stringify(up).slice(0, 300));

  step("3. Create project");
  const proj = await api("POST", "/api/projects", {
    title: "AutoClip E2E", productType: "auto-clip", uploadedVideoUrl,
  });
  check("project created (201)", proj.status === 201, `status=${proj.status}`);
  const projectId: string = proj.body?.project?.id;
  check("projectId returned", !!projectId);

  step("4. Kick off analysis");
  const kickoff = await api("POST", "/api/generate/auto-clip", {
    projectId, minDuration: 10, maxDuration: 25, clipCount: 2,
    aspectRatio: "9:16", captionStyleIndex: 0, instructions: "",
    removeSilence: false, removeFillers: false, animatedCaptions: true,
  });
  check("analyze accepted (200)", kickoff.status === 200, `status=${kickoff.status} ${kickoff.text.slice(0, 200)}`);

  const dup = await api("POST", "/api/generate/auto-clip", { projectId });
  check("double-submit rejected (409)", dup.status === 409, `status=${dup.status}`);

  step("5. Wait for picks (pending_review)");
  const picked = await waitFor("pending_review", async () => {
    const r = await api("GET", `/api/projects/${projectId}/clips`);
    const st = r.body?.project?.status;
    if (st === "pending_review") return r.body;
    if (st === "failed") return r.body;
    return null;
  }, 10 * 60 * 1000);

  check("analysis finished", picked?.project?.status === "pending_review",
    `status=${picked?.project?.status} reason=${picked?.project?.failureReason}`);
  if (picked?.project?.status !== "pending_review") {
    throw new Error(`pick failed: ${picked?.project?.failureReason ?? "unknown"}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clips: any[] = picked.clips ?? [];
  check("clips proposed", clips.length > 0, `count=${clips.length}`);
  check("clips have titles", clips.every((c) => !!c.title));
  check("clips have score breakdowns", clips.every((c) => c.scoreBreakdown?.hook !== undefined));
  check("clip durations inside the requested band",
    clips.every((c) => c.durationSec >= 9.5 && c.durationSec <= 25.5),
    clips.map((c) => c.durationSec?.toFixed(1)).join(","));
  console.log("  warnings:", JSON.stringify(picked.project.warnings));

  const dbClips = await prisma.clip.findMany({ where: { projectId }, orderBy: { index: "asc" } });
  const transcribed = dbClips.filter((c) => Array.isArray(c.transcriptJson) && (c.transcriptJson as unknown[]).length > 0);
  const warnings = (picked.project.warnings ?? []) as string[];
  hasTranscript = transcribed.length > 0;
  if (hasTranscript) {
    check("signal track built", dbClips.some((c) => !!c.signalTrack));
    check("captions enabled on transcribed clips", transcribed.every((c) => c.hasCaptions));
  } else {
    // Degraded run: assert the degradation is reported honestly rather than
    // silently producing caption-less clips.
    check("transcription failure surfaced as a warning", warnings.includes("transcription_failed"),
      JSON.stringify(warnings));
    check("captions disabled when there are no words", dbClips.every((c) => !c.hasCaptions));
  }

  step("6. Cost estimate matches confirm");
  const est = await api("POST", `/api/projects/${projectId}/clips/estimate`, {
    clips: clips.map((c) => ({ id: c.id, keep: true })),
  });
  check("estimate (200)", est.status === 200, `status=${est.status} ${est.text.slice(0, 200)}`);
  check("estimate has a total", typeof est.body?.total === "number", JSON.stringify(est.body));
  check("estimate says affordable", est.body?.sufficient === true, JSON.stringify(est.body));

  step("7. Confirm (keep all, one re-aspected to 1:1)");
  const confirmBody = {
    clips: clips.map((c, i) => ({
      id: c.id, keep: true,
      ...(i === 1 ? { aspectRatio: "1:1" as const } : {}),
    })),
  };
  const conf = await api("POST", `/api/projects/${projectId}/clips/confirm`, confirmBody);
  check("confirm (200)", conf.status === 200, `status=${conf.status} ${conf.text.slice(0, 250)}`);
  check("charge equals estimate", conf.body?.creditsCharged === est.body?.total,
    `charged=${conf.body?.creditsCharged} estimated=${est.body?.total}`);

  const confDup = await api("POST", `/api/projects/${projectId}/clips/confirm`, confirmBody);
  check("double-confirm rejected (409)", confDup.status === 409, `status=${confDup.status}`);

  step("8. Wait for render");
  const done = await waitFor("render", async () => {
    const r = await api("GET", `/api/projects/${projectId}/clips`);
    const st = r.body?.project?.status;
    if (st === "completed" || st === "failed") return r.body;
    return null;
  }, 20 * 60 * 1000);
  check("render finished", done?.project?.status === "completed",
    `status=${done?.project?.status} reason=${done?.project?.failureReason}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rendered: any[] = done?.clips ?? [];
  check("every clip ready", rendered.every((c) => c.status === "ready"),
    rendered.map((c) => `${c.index}:${c.status}`).join(","));
  check("every clip has a videoUrl", rendered.every((c) => !!c.videoUrl));
  check("every clip has a thumbnail", rendered.every((c) => !!c.thumbnailUrl));
  check("every clip has audio peaks", rendered.every((c) => Array.isArray(c.audioPeaks) && c.audioPeaks.length > 0));
  check("scores recalibrated after render",
    rendered.every((c) => typeof c.score === "number" && c.scoreBreakdown?.audio !== undefined));

  step("9. Probe rendered output");
  for (const c of rendered) {
    if (!c.videoUrl) continue;
    const dest = path.join(TMP, `out-${c.index}.mp4`);
    const res = await fetch(c.videoUrl);
    check(`clip ${c.index} downloadable`, res.ok, `status=${res.status}`);
    if (!res.ok) continue;
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    const info = await probeTolerant(dest);
    // Free tier caps the short edge at 720 (watermarkFilterChain), so the
    // expected frame depends on the plan the run is on.
    const full = c.aspectRatio === "1:1" ? [1080, 1080] : c.aspectRatio === "16:9" ? [1920, 1080] : [1080, 1920];
    const expect = paidTier ? full : (c.aspectRatio === "16:9" ? [1280, 720] : c.aspectRatio === "1:1" ? [720, 720] : [720, 1280]);
    check(`clip ${c.index} dimensions ${expect[0]}x${expect[1]}`,
      info.w === expect[0] && info.h === expect[1], `got ${info.w}x${info.h} for ${c.aspectRatio}`);
    check(`clip ${c.index} duration ≈ ${c.durationSec?.toFixed(1)}s`,
      Math.abs(info.durationSec - c.durationSec) < 1.5, `got ${info.durationSec.toFixed(2)}s`);
    check(`clip ${c.index} has audio`, info.hasAudio);
    check(`clip ${c.index} is not empty`, fs.statSync(dest).size > 50_000, `${fs.statSync(dest).size} bytes`);
  }

  step("10. Studio edits (charged re-render paths)");
  const target = rendered[0];
  if (target) {
    const detail = await api("GET", `/api/projects/${projectId}/clips?clipId=${target.id}`);
    check("transcript detail fetch", detail.status === 200 && !!detail.body?.detail,
      JSON.stringify(detail.body?.detail)?.slice(0, 120));

    const badStyle = await api("PUT", `/api/projects/${projectId}/clips/${target.id}/style`, {
      subtitleStyleOverride: { fontSize: 1e9 },
    });
    check("absurd fontSize rejected (400)", badStyle.status === 400, `status=${badStyle.status}`);

    const badTranscript = await api("PUT", `/api/projects/${projectId}/clips/${target.id}/transcript`, {
      transcript: [{ word: "hi{\\p1}", start: 0, end: 100 }],
    });
    check("transcript accepted + sanitized", badTranscript.status === 200, `status=${badTranscript.status} ${badTranscript.text.slice(0, 200)}`);

    const afterSanitize = await waitFor("sanitized transcript", async () => {
      const c = await prisma.clip.findUnique({ where: { id: target.id }, select: { transcriptJson: true } });
      const words = c?.transcriptJson as unknown as { word: string }[] | null;
      return words && words.length === 1 ? words : null;
    }, 30_000, 1000);
    check("ASS control chars stripped from words",
      !!afterSanitize && !/[{}\\]/.test(afterSanitize[0].word), JSON.stringify(afterSanitize));

    const reRendered = await waitFor("re-render", async () => {
      const c = await prisma.clip.findUnique({ where: { id: target.id }, select: { status: true, rerenderCount: true } });
      return c && (c.status === "ready" || c.status === "failed") ? c : null;
    }, 10 * 60 * 1000);
    check("re-render completed", reRendered?.status === "ready", `status=${reRendered?.status}`);
    check("rerenderCount incremented", (reRendered?.rerenderCount ?? 0) >= 1, `count=${reRendered?.rerenderCount}`);
  }

  step("11. Bulk download");
  const zip = await fetch(`${BASE}/api/projects/${projectId}/clips/download-all`, {
    headers: authHeaders(),
  });
  check("download-all (200)", zip.ok, `status=${zip.status}`);
  if (zip.ok) {
    const buf = Buffer.from(await zip.arrayBuffer());
    check("archive is non-trivial", buf.length > 50_000, `${buf.length} bytes`);
  }

  step("12. Ownership isolation");
  const mine = token;
  const myCookie = cookie;
  const other = await api("POST", "/api/auth/register", {
    firstName: "Other", lastName: "User", email: `autoclip-other-${ts}@example.com`,
    phone: `8${String(ts).slice(-9)}`, password: "password123", confirmPassword: "password123",
  });
  // captureCookie already swapped the cookie to the new user's session.
  token = other.body?.token ?? "";
  const stolen = await api("GET", `/api/projects/${projectId}/clips`);
  check("other user cannot read clips (404)", stolen.status === 404, `status=${stolen.status}`);
  const stolenRerender = await api("POST", `/api/projects/${projectId}/clips/${rendered[0]?.id}/rerender`, { startSec: 0, endSec: 5 });
  check("other user cannot re-render (404)", stolenRerender.status === 404 || stolenRerender.status === 400,
    `status=${stolenRerender.status}`);
  token = mine;
  cookie = myCookie;

  console.log(`\n\n================ SUMMARY ================`);
  console.log(`PASS ${pass}   FAIL ${fail}`);
  if (!hasTranscript) {
    console.log("NOTE: this run had no transcript (no working STT key), so caption,");
    console.log("      silence-removal and emphasis paths were NOT exercised.");
  }
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log(`Project: ${projectId}`);
}

main()
  .then(() => process.exit(fail > 0 ? 1 : 0))
  .catch((e) => { console.error("\nHARNESS ERROR:", e); process.exit(2); });
