import { withRetry } from "@/lib/with-retry";
import { env } from "@/lib/env";

// Generic FAL queue client — submit a job, poll it to completion, and extract
// the result URL. Generalized from the hand-rolled submit/poll pair that used
// to live inline in app/api/tools/video-generator/route.ts (and is duplicated,
// not yet migrated, in face-swap/background-remover/vocal-remover routes).

export function falAuth() {
  return { Authorization: `Key ${env.FAL_KEY}` };
}

export async function falSubmit(endpoint: string, input: Record<string, unknown>): Promise<string> {
  const res = await withRetry(
    (signal) => fetch(`https://queue.fal.run/${endpoint}`, {
      method: "POST",
      headers: { ...falAuth(), "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    }),
    { timeoutMs: 15_000 },
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`fal.ai submit error ${res.status}: ${txt}`);
  }
  const data = await res.json();
  return data.request_id as string;
}

export async function falPollUntilDone(
  endpoint: string,
  requestId: string,
  opts?: { deadlineMs?: number; pollIntervalMs?: number },
): Promise<unknown> {
  const deadline = Date.now() + (opts?.deadlineMs ?? 12 * 60 * 1000);
  const pollIntervalMs = opts?.pollIntervalMs ?? 5000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const statusRes = await fetch(
      `https://queue.fal.run/${endpoint}/requests/${requestId}/status`,
      { headers: falAuth() },
    );
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    const status = statusData.status as string;
    if (status === "COMPLETED") {
      const resultRes = await fetch(
        `https://queue.fal.run/${endpoint}/requests/${requestId}`,
        { headers: falAuth() },
      );
      if (!resultRes.ok) throw new Error("fal.ai result fetch failed");
      return resultRes.json();
    }
    if (status === "FAILED") {
      const err = statusData.error ?? "fal.ai generation failed";
      throw new Error(typeof err === "string" ? err : JSON.stringify(err));
    }
  }
  throw new Error("fal.ai generation timed out");
}

// Walks each dot-path (e.g. "images.0.url") against the raw FAL result JSON in
// order, returning the first one that resolves to a non-empty string — result
// shapes vary per model (result.video.url, result.images[0].url, result.image.url, ...).
export function extractResultUrl(raw: unknown, resultPath: string[]): string {
  for (const path of resultPath) {
    let cur: unknown = raw;
    for (const segment of path.split(".")) {
      if (cur == null || typeof cur !== "object") { cur = undefined; break; }
      cur = (cur as Record<string, unknown>)[segment];
    }
    if (typeof cur === "string" && cur.length > 0) return cur;
  }
  throw new Error(`No result URL found in fal.ai response at path(s): ${resultPath.join(", ")}`);
}
