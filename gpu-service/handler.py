"""
GPU media service — one container, two workloads.

  kind="asd"     active-speaker detection (Light-ASD) over a source video
  kind="render"  NVENC ffmpeg encode of one clip

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


# ── Entry point ─────────────────────────────────────────────────────────────

HANDLERS = {"asd": handle_asd, "render": handle_render}


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
