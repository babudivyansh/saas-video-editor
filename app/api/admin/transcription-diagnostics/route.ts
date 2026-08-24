// P0-1 transcription runtime diagnostics. Admin-only (withAdmin requires role
// + a recent OTP step-up).
//
// Answers, with real evidence rather than assumption: which speech-to-text
// providers is production actually configured with, do their credentials even
// look like credentials, and — critically — do they authenticate?
//
// The live check hits each provider's cheapest identity endpoint
// (ElevenLabs /v1/user, OpenAI /v1/models). Neither transcribes anything, so
// this cannot incur usage charges. fal is deliberately not probed: it has no
// free identity endpoint and every entry point queues billable work, so
// probing it would spend the owner's money to answer a configuration question.
//
// This route never returns, logs, or otherwise reveals a credential value —
// only presence, shape verdicts, and HTTP status codes.

import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import {
  describeProviders,
  getTranscriptionRuntimeHealth,
  probeProviderAuth,
} from "@/lib/transcription-runtime";

export const GET = withAdmin(async () => {
  const health = getTranscriptionRuntimeHealth();
  const auth = await probeProviderAuth();

  const byName = new Map(auth.map((a) => [a.name, a]));
  const providers = describeProviders().map((p) => {
    const probe = byName.get(p.name);
    return {
      provider: p.name,
      configured: p.configured,
      credentialShapeValid: p.shapeValid,
      credentialShapeIssue: p.shapeIssue,
      liveAuth: probe
        ? (!probe.attempted ? "NOT POSSIBLE" : probe.ok ? "PASS" : "FAIL")
        : "NOT POSSIBLE",
      liveAuthStatus: probe?.status ?? null,
      liveAuthDetail: probe?.detail ?? null,
    };
  });

  const working = providers.filter((p) => p.liveAuth === "PASS").map((p) => p.provider);

  return NextResponse.json({
    note: "REPORT-ONLY. Identity endpoints only — no transcription is performed and no usage is billed. No credential values are ever returned.",
    // The order lib/transcription.ts actually attempts them.
    providerChainOrder: ["elevenlabs", "openai", "fal"],
    providers,
    requestGate: {
      ok: health.ok,
      reason: health.reason,
      description: health.ok
        ? "Caption requests are permitted (at least one configured credential is well-formed)."
        : "Caption requests are refused before any credit is spent.",
    },
    workingProviders: working,
    verdict: working.length > 0
      ? `USABLE — ${working.join(", ")} authenticated successfully`
      : "UNUSABLE — no provider authenticated; caption generation cannot succeed",
  });
});
