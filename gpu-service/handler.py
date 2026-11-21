"""
GPU media service — one container, four workloads.

  kind="asd"     active-speaker detection (Light-ASD) over a source video
  kind="render"  NVENC ffmpeg encode of one clip
  kind="embed"   SigLIP text/image embeddings (AutoClip B-roll ranking)
  kind="track"   SAM 2 subject tracking from a seed box (AutoClip reframing)

Design rules, and the reason each exists:

  * PURE MEDIA FUNCTION. Inputs arrive as presigned GET URLs, output goes to a
    presigned PUT URL. This container holds no AWS credentials and cannot
    enumerate the bucket, so renting ephemeral GPU capacity does not mean
    handing a third party our storage.

  * NO IDENTITY. Nothing here knows which user or project a job belongs to.
    The only user content on disk is the clip being cut and its subtitle file,
    both deleted before the handler returns.

  * STRUCTURED ERRORS. Every failure is classified transport / input /
    internal. The caller falls back to CPU for transport failures and gives up
    immediately for input failures — an unreadable source will not become
    readable by being retried on a different machine.
"""

import hashlib
import hmac
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.request

GPU_SERVICE_TOKEN = os.environ["GPU_SERVICE_TOKEN"]
# Requests older than this are rejected, so a captured payload cannot be
# replayed later.
MAX_CLOCK_SKEW_SEC = 300


class JobError(Exception):
    def __init__(self, message, error_class="internal"):
        super().__init__(message)
        self.message = message
        self.error_class = error_class


# ── Auth ────────────────────────────────────────────────────────────────────

def verify_signature(job_input):
    """HMAC over the canonical JSON of the input, minus the signature fields.

    The signature is carried in the payload rather than a header because
    serverless platforms hand the handler only the JSON body.
    """
    ts = job_input.pop("_ts", None)
    sig = job_input.pop("_sig", None)
    if ts is None or sig is None:
        raise JobError("missing request signature", "internal")
    if abs(time.time() - float(ts)) > MAX_CLOCK_SKEW_SEC:
        raise JobError("request timestamp outside the accepted window", "internal")

    payload = json.dumps(job_input, sort_keys=True, separators=(",", ":"))
    expected = hmac.new(
        GPU_SERVICE_TOKEN.encode(), f"{ts}.{payload}".encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, str(sig)):
        raise JobError("bad request signature", "internal")


# ── Media helpers ───────────────────────────────────────────────────────────

def download(url, dest):
    try:
        with urllib.request.urlopen(url, timeout=120) as r, open(dest, "wb") as f:
            shutil.copyfileobj(r, f)
    except Exception as e:
        # A presigned URL that will not fetch is an input problem: the same URL
        # will not fetch from the CPU worker either.
        raise JobError(f"could not fetch input: {e}", "input")
    return dest


def upload(path, put_url):
    with open(path, "rb") as f:
        req = urllib.request.Request(put_url, data=f.read(), method="PUT")
        req.add_header("Content-Type", "video/mp4")
        try:
            urllib.request.urlopen(req, timeout=300)
        except Exception as e:
            raise JobError(f"could not upload output: {e}", "transport")


def run_ffmpeg(args):
    proc = subprocess.run(
        ["ffmpeg", *args], capture_output=True, text=True, timeout=900
    )
    if proc.returncode != 0:
        tail = proc.stderr[-2000:]
        # ffmpeg rejects a malformed filtergraph or an undecodable source the
        # same way on any machine — that is an input failure, not a transport
        # one, and must not trigger a pointless CPU retry.
        cls = "input" if (
            "Invalid argument" in tail
            or "No such file" in tail
            or "Invalid data found" in tail
            or "Error parsing filterchain" in tail
        ) else "transport"
        raise JobError(f"ffmpeg exited {proc.returncode}: {tail}", cls)
    return proc.stderr


# ── Workload: render ────────────────────────────────────────────────────────

def handle_render(job_input, workdir):
    source = download(job_input["sourceUrl"], os.path.join(workdir, "source.mp4"))
    out_path = os.path.join(workdir, "out.mp4")

    # Extra inputs (B-roll, the .ass subtitle file) are fetched by name so the
    # caller's filtergraph can reference them as plain local filenames.
    for extra in job_input.get("extraInputs", []):
        download(extra["url"], os.path.join(workdir, extra["name"]))

    args = []
    if job_input.get("startSec") is not None:
        args += ["-ss", str(job_input["startSec"])]
    if job_input.get("endSec") is not None:
        args += ["-to", str(job_input["endSec"])]
    args += ["-y", "-i", source, *job_input["args"], out_path]

    started = time.time()
    # Filters run relative to the working directory so filtergraph paths stay
    # identical to the ones the CPU path builds.
    cwd = os.getcwd()
    os.chdir(workdir)
    try:
        run_ffmpeg(args)
    finally:
        os.chdir(cwd)
    encode_sec = time.time() - started

    upload(out_path, job_input["outputPutUrl"])
    return {
        "durationSec": probe_duration(out_path),
        "bytes": os.path.getsize(out_path),
        "encodeSec": round(encode_sec, 2),
    }


def probe_duration(path):
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", path],
            capture_output=True, text=True, timeout=60,
        )
        return float(out.stdout.strip())
    except Exception:
        return 0.0


# ── Workload: active-speaker detection ──────────────────────────────────────

def handle_asd(job_input, workdir):
    from asd_model import detect_speakers  # Light-ASD wrapper, see Dockerfile

    source = download(job_input["videoUrl"], os.path.join(workdir, "source.mp4"))
    sample_fps = int(job_input.get("sampleFps", 5))

    tracks = detect_speakers(source, sample_fps=sample_fps, workdir=workdir)

    # Coordinates are emitted as FRACTIONS of the frame, matching the FaceBox
    # shape the pipeline already uses for Rekognition. Pixel coordinates would
    # silently break the moment a source resolution changed.
    return {
        "version": 1,
        "srcW": tracks["width"],
        "srcH": tracks["height"],
        "tracks": [
            {
                "trackId": t["id"],
                "samples": [
                    {
                        "t": round(s["t"], 3),
                        "x": round(s["x"], 4), "y": round(s["y"], 4),
                        "w": round(s["w"], 4), "h": round(s["h"], 4),
                        "conf": round(s["conf"], 3),
                        "speaking": round(s["speaking"], 3),
                    }
                    for s in t["samples"]
                ],
            }
            for t in tracks["tracks"]
        ],
    }


# ── Workload: embeddings (SigLIP) ───────────────────────────────────────────
#
# AutoClip B-roll ranking and the creator's library search
# (lib/autoclip-ai/broll-rank.ts). Embeddings are L2-normalised, so the caller
# scores with a plain dot product: p = sigmoid(cos * logitScale + logitBias),
# which is SigLIP's own pairwise probability.

SIGLIP_MODEL_ID = os.environ.get("SIGLIP_MODEL", "google/siglip-base-patch16-224")
# Baked into the image under weights/ (see Dockerfile) so a cold start never
# downloads them; falls back to the hub id for local development.
SIGLIP_PATH = os.environ.get("SIGLIP_PATH", "/app/weights/siglip")
_siglip = None


def load_siglip():
    global _siglip
    if _siglip is None:
        import torch
        from transformers import AutoModel, AutoProcessor

        src = SIGLIP_PATH if os.path.isdir(SIGLIP_PATH) else SIGLIP_MODEL_ID
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = AutoModel.from_pretrained(src).to(device).eval()
        processor = AutoProcessor.from_pretrained(src)
        _siglip = (model, processor, device)
    return _siglip


def handle_embed(job_input, workdir):
    import torch
    from PIL import Image

    model, processor, device = load_siglip()
    texts = [str(t)[:300] for t in (job_input.get("texts") or [])][:16]
    urls = list(job_input.get("imageUrls") or [])[:64]

    images = []
    for i, url in enumerate(urls):
        try:
            path = download(url, os.path.join(workdir, f"img{i}"))
            images.append(Image.open(path).convert("RGB"))
        except Exception:  # noqa: BLE001 - one bad still must not fail the batch
            images.append(None)

    def norm(t):
        return t / t.norm(dim=-1, keepdim=True)

    text_out, image_out = [], []
    with torch.no_grad():
        if texts:
            inputs = processor(text=texts, padding="max_length", truncation=True, return_tensors="pt").to(device)
            text_out = norm(model.get_text_features(**inputs)).cpu().tolist()
        valid = [im for im in images if im is not None]
        if valid:
            inputs = processor(images=valid, return_tensors="pt").to(device)
            image_out = norm(model.get_image_features(**inputs)).cpu().tolist()

    it = iter(image_out)
    r = lambda v: [round(x, 5) for x in v]  # noqa: E731
    return {
        "model": SIGLIP_MODEL_ID,
        "textEmbeddings": [r(v) for v in text_out],
        "imageEmbeddings": [r(next(it)) if im is not None else None for im in images],
        "logitScale": float(model.logit_scale.exp().item()),
        "logitBias": float(model.logit_bias.item()) if getattr(model, "logit_bias", None) is not None else 0.0,
    }


# ── Workload: subject tracking (SAM 2) ──────────────────────────────────────
#
# Follows a non-face subject through a shot from one seed box
# (lib/autoclip-ai/subject-track.ts). Each seed is its own short window of the
# source; frames are sampled at sampleFps, which is plenty for a camera path
# that is itself solved at 10 Hz.

SAM2_CONFIG = os.environ.get("SAM2_CONFIG", "configs/sam2.1/sam2.1_hiera_s.yaml")
SAM2_CHECKPOINT = os.environ.get("SAM2_CHECKPOINT", "/app/weights/sam2.1_hiera_small.pt")
_sam2 = None


def load_sam2():
    global _sam2
    if _sam2 is None:
        import torch
        from sam2.build_sam import build_sam2_video_predictor

        device = "cuda" if torch.cuda.is_available() else "cpu"
        _sam2 = build_sam2_video_predictor(SAM2_CONFIG, SAM2_CHECKPOINT, device=device)
    return _sam2


def extract_frames(source, start, end, fps, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    run_ffmpeg([
        "-y", "-ss", str(start), "-to", str(end), "-i", source,
        "-vf", f"fps={fps}", "-q:v", "2", "-start_number", "0",
        os.path.join(out_dir, "%05d.jpg"),
    ])
    return sorted(f for f in os.listdir(out_dir) if f.endswith(".jpg"))


def handle_track(job_input, workdir):
    import numpy as np
    import torch
    from PIL import Image

    predictor = load_sam2()
    source = download(job_input["videoUrl"], os.path.join(workdir, "source.mp4"))
    fps = max(1, min(15, int(job_input.get("sampleFps", 10))))
    tracks = []
    for n, seed in enumerate((job_input.get("seeds") or [])[:40]):
        start, end = float(seed["startSec"]), float(seed["endSec"])
        frames_dir = os.path.join(workdir, f"seed{n}")
        frames = extract_frames(source, start, end, fps, frames_dir)
        if len(frames) < 2:
            tracks.append({"startSec": start, "endSec": end, "samples": []})
            continue
        with Image.open(os.path.join(frames_dir, frames[0])) as im:
            fw, fh = im.size
        b = seed["box"]
        box = np.array([b["x"] * fw, b["y"] * fh, (b["x"] + b["w"]) * fw, (b["y"] + b["h"]) * fh], dtype=np.float32)

        samples = []
        with torch.inference_mode():
            state = predictor.init_state(video_path=frames_dir)
            predictor.add_new_points_or_box(state, frame_idx=0, obj_id=1, box=box)
            for frame_idx, _obj_ids, mask_logits in predictor.propagate_in_video(state):
                mask = (mask_logits[0] > 0).squeeze().cpu().numpy()
                ys, xs = np.nonzero(mask)
                if len(xs) == 0:
                    continue  # lost on this frame; the solver holds through gaps
                x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
                samples.append({
                    "t": round(start + frame_idx / fps, 3),
                    "x": round(float(x0) / fw, 4), "y": round(float(y0) / fh, 4),
                    "w": round(float(x1 - x0 + 1) / fw, 4), "h": round(float(y1 - y0 + 1) / fh, 4),
                })
            predictor.reset_state(state)
        shutil.rmtree(frames_dir, ignore_errors=True)
        tracks.append({"startSec": start, "endSec": end, "samples": samples})
    return {"version": 1, "tracks": tracks}


# ── Entry point ─────────────────────────────────────────────────────────────

HANDLERS = {"asd": handle_asd, "render": handle_render, "embed": handle_embed, "track": handle_track}


def handler(job):
    job_input = dict(job.get("input") or {})
    workdir = tempfile.mkdtemp(prefix="gpujob-")
    try:
        verify_signature(job_input)
        kind = job_input.get("kind")
        if kind not in HANDLERS:
            raise JobError(f"unknown job kind: {kind}", "internal")
        return HANDLERS[kind](job_input, workdir)
    except JobError as e:
        return {"error": {"class": e.error_class, "message": e.message}}
    except Exception as e:  # noqa: BLE001 - last-resort guard
        return {"error": {"class": "internal", "message": repr(e)}}
    finally:
        # The container's disk is ephemeral, but user media should not outlive
        # the job that needed it even so.
        shutil.rmtree(workdir, ignore_errors=True)


if __name__ == "__main__":
    import runpod
    runpod.serverless.start({"handler": handler})
