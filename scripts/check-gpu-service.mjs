#!/usr/bin/env node
// Preflight for the GPU media service.
//
// The GPU path is inert until GPU_SERVICE_URL is set, and when it IS set the
// failure modes are quiet by design — every caller falls back to CPU rather
// than erroring. That is right for production and useless for setup, because a
// misconfigured service looks exactly like a disabled one. This says which.
//
//   node scripts/check-gpu-service.mjs
//
// Checks, in order: config present → endpoint reachable → HMAC accepted →
// (optionally) a real ASD job round-trips.

import { createHmac } from "crypto";

const URL_BASE = process.env.GPU_SERVICE_URL;
const TOKEN = process.env.GPU_SERVICE_TOKEN;
const API_KEY = process.env.GPU_SERVICE_API_KEY;

const ok = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`\x1b[31m✗\x1b[0m ${m}`);
const info = (m) => console.log(`  ${m}`);

function authHeaders() {
  return {
    "Content-Type": "application/json",
    ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
  };
}

// Must match lib/gpu-service.ts's signInput exactly, or the container will
// reject every job with a signature error that looks like an outage.
function signInput(input) {
  const ts = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify(input, Object.keys(input).sort());
  const sig = createHmac("sha256", TOKEN ?? "").update(`${ts}.${payload}`).digest("hex");
  return { ...input, _ts: ts, _sig: sig };
}

async function main() {
  console.log("\nGPU service preflight\n");

  if (!URL_BASE || !TOKEN) {
    bad("GPU service is NOT configured — the app will use CPU for everything.");
    info(`GPU_SERVICE_URL:   ${URL_BASE ? "set" : "MISSING"}`);
    info(`GPU_SERVICE_TOKEN: ${TOKEN ? "set" : "MISSING"}`);
    info(`GPU_SERVICE_API_KEY: ${API_KEY ? "set" : "not set (fine for a self-hosted container)"}`);
    info("");
    info("This is a valid state: AutoClip works without it. See gpu-service/README.md.");
    process.exit(0);
  }
  ok("Config present");

  try {
    const res = await fetch(`${URL_BASE}/health`, { headers: authHeaders(), signal: AbortSignal.timeout(10_000) });
    if (res.ok) ok(`Reachable (${res.status})`);
    else { bad(`Health check returned ${res.status}`); process.exit(1); }
  } catch (err) {
    bad(`Unreachable: ${err.message}`);
    info("Check GPU_SERVICE_URL, and that the endpoint has at least one worker available.");
    process.exit(1);
  }

  // A signed no-op submit proves the shared secret matches on both sides,
  // which is the single most common setup mistake.
  try {
    const body = JSON.stringify({ input: signInput({ kind: "asd", videoUrl: "preflight://noop", sampleFps: 1 }) });
    const res = await fetch(`${URL_BASE}/run`, { method: "POST", headers: authHeaders(), body, signal: AbortSignal.timeout(20_000) });
    const text = await res.text();

    if (res.ok) {
      ok("Signed submit accepted — the shared secret matches");
      info(`Response: ${text.slice(0, 200)}`);
      info("A job id here means the queue works; the job itself will fail on the fake URL, which is expected.");
    } else if (/signature|timestamp/i.test(text)) {
      bad("Signature rejected — GPU_SERVICE_TOKEN differs between the app and the container");
      process.exit(1);
    } else {
      bad(`Submit returned ${res.status}: ${text.slice(0, 300)}`);
      process.exit(1);
    }
  } catch (err) {
    bad(`Submit failed: ${err.message}`);
    process.exit(1);
  }

  console.log("\nGPU service looks correctly wired.");
  console.log("Routing (which tiers and clip sizes actually use it) is the `gpu_routing` Config row,");
  console.log("and the `gpu_service` feature flag is the kill switch.\n");
}

main();
