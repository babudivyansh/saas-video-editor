# GPU media service

One container serving two AutoClip workloads:

| kind | What it does | Why it needs a GPU |
|---|---|---|
| `asd` | Active-speaker detection (Light-ASD) over a source video | No CPU equivalent. This is the workload that justifies the pool. |
| `render` | NVENC encode of one clip | Offloads **only** the encode — see the ROI note below. |

The client is [`lib/gpu-service.ts`](../lib/gpu-service.ts); routing policy is
[`lib/render-target.ts`](../lib/render-target.ts).

## Contract

```
POST /run            { "input": { "kind": "asd"|"render", ...,  "_ts": 1234, "_sig": "…" } }  -> { "id": "…" }
GET  /status/{id}    -> { "status": "IN_QUEUE"|"IN_PROGRESS"|"COMPLETED"|"FAILED",
                          "output": {...} | "error": { "class": "transport"|"input"|"internal", "message": "…" } }
GET  /health         -> 200
```

`_sig` is `HMAC-SHA256(GPU_SERVICE_TOKEN, "{_ts}.{canonical_json_of_input}")`.
It lives **inside the payload, not in a header**, because serverless platforms
hand the handler only the JSON body — a header signature never arrives.

### Error classes carry meaning

- `transport` — unreachable, timed out, crashed. The caller retries the same
  work on CPU inside the same job attempt.
- `input` — unreadable source, malformed filtergraph. The caller gives up
  immediately; this will fail identically on CPU, and burning a second render
  to prove it is waste.
- `internal` — auth or request-shape bug on our side. Treated as transport for
  fallback, but logged loudly.

Only `transport` failures count toward the circuit breaker. A single malformed
job must not disable GPU for every user.

## Deploying (RunPod Serverless)

1. Build and push:
   ```bash
   docker build -t <registry>/clipiro-gpu:1 gpu-service/
   docker push <registry>/clipiro-gpu:1
   ```
   `weights/` and `fonts/` are **not** committed — populate them before
   building. Fonts must match the ones `resolveFontFile` uses, or burned-in
   captions render differently on GPU than on CPU.

2. Create a Serverless endpoint. Suggested policy, matching
   `GPU_ROUTING_DEFAULTS`:

   | | ASD | Render |
   |---|---|---|
   | min workers | **0, always** | 0 (1 during peak, if you want) |
   | idle timeout | 15s | 90s |
   | max workers | 3 | 6 |
   | GPU | A4000/L4 class is plenty | same |

   ASD runs inside `pickJob`, which already spends minutes on transcription and
   Gemini, so a cold start is invisible there. Never pay to keep it warm.

3. Set on the app:
   ```
   GPU_SERVICE_URL=https://api.runpod.ai/v2/<endpoint-id>
   GPU_SERVICE_TOKEN=<shared secret, also set in the container env>
   GPU_SERVICE_API_KEY=<RunPod API key>
   ```
   All three are optional in `lib/env.ts`. Absent config means "GPU disabled"
   and every caller falls back — the app boots and works exactly as before.

4. Roll out with the `gpu_service` feature flag (admin → ops) and the
   `gpu_routing` Config row for tier/threshold policy.

## Read this before scaling the render pool

NVENC offloads the **encode only**. In this filtergraph, libass subtitle
burn-in, `crop`, `zoompan`, the mood grade, `vstack` and the watermark all stay
on CPU, and handing frames to NVENC costs an `hwupload`. Realistic end-to-end
gain is **~1.3–2x, not 5–10x**.

That is why `GPU_ROUTING_DEFAULTS` gates renders behind `minSourcePixels` and
`minClipSec`: for a short 1080p clip the S3 round-trip plus a cold start
comfortably exceeds the entire CPU render, so routing everything here would be
both slower and more expensive.

Meanwhile `renderJob` now renders clips through a bounded pool
(`RENDER_CLIP_CONCURRENCY`, default 3) rather than strictly one after another,
which was a larger and completely free win. **Measure before growing the pool.**

## Local smoke test

```bash
docker run --rm --gpus all -e GPU_SERVICE_TOKEN=dev -p 8000:8000 <image>
# ffmpeg must report the encoder, or the base image is wrong:
docker run --rm --gpus all <image> ffmpeg -hide_banner -encoders | grep nvenc
```
