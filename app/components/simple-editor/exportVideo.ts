import type { EditorState, ExportFormat } from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  state: EditorState,
  currentTime: number,
) {
  const { rotation, crop } = state;
  const cw = canvas.width;
  const ch = canvas.height;

  ctx.save();

  // Rotation transform around center
  if (rotation !== 0) {
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-cw / 2, -ch / 2);
  }

  if (crop) {
    // Crop: source rect is the crop box in video-pixel space
    const sx = (crop.x / 100) * video.videoWidth;
    const sy = (crop.y / 100) * video.videoHeight;
    const sw = (crop.width / 100) * video.videoWidth;
    const sh = (crop.height / 100) * video.videoHeight;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
  } else {
    ctx.drawImage(video, 0, 0, cw, ch);
  }

  ctx.restore();

  // Text overlays
  for (const overlay of state.textOverlays) {
    const sizeMap = { sm: 18, md: 26, lg: 38 };
    const fontSize = sizeMap[overlay.fontSize];
    ctx.font = `${overlay.italic ? "italic " : ""}${overlay.bold ? "bold " : ""}${fontSize}px sans-serif`;
    ctx.fillStyle = overlay.color || "#ffffff";
    ctx.textAlign = "center";

    const yMap = { top: ch * 0.1, center: ch * 0.5, bottom: ch * 0.88 };
    ctx.fillText(overlay.text, cw / 2, yMap[overlay.position]);
  }

  // Active caption
  const t = currentTime;
  const activeCap = state.captions.find(c => t >= c.startTime && t <= c.endTime);
  if (activeCap) {
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center";
    // Dark background pill
    const metrics = ctx.measureText(activeCap.text);
    const pad = 12;
    const bh = 38;
    const bw = metrics.width + pad * 2;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.beginPath();
    ctx.roundRect(cw / 2 - bw / 2, ch - 70, bw, bh, 8);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(activeCap.text, cw / 2, ch - 70 + bh / 2 + 7);
  }
}

// ── Client-side export (MediaRecorder) ───────────────────────────────────────

export async function exportClientSide(
  videoEl: HTMLVideoElement,
  state: EditorState,
  format: ExportFormat,
  onProgress: (pct: number) => void,
): Promise<void> {
  const { trim, video } = state;
  if (!video) throw new Error("No video loaded");

  const duration = trim.end - trim.start;
  const mimeType = format === "webm" ? "video/webm;codecs=vp9" : "video/webm"; // browsers only record webm natively
  if (!MediaRecorder.isTypeSupported(mimeType) && !MediaRecorder.isTypeSupported("video/webm")) {
    throw new Error("Your browser does not support video recording. Try Chrome.");
  }

  // Canvas dimensions: use crop if set, else original (capped at 1920)
  const vw = video.width || videoEl.videoWidth;
  const vh = video.height || videoEl.videoHeight;
  let cw = vw, ch = vh;
  if (state.crop) {
    cw = Math.round((state.crop.width / 100) * vw);
    ch = Math.round((state.crop.height / 100) * vh);
  }
  // Cap at 1080p
  const scale = Math.min(1, 1920 / Math.max(cw, ch));
  cw = Math.round(cw * scale);
  ch = Math.round(ch * scale);

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d")!;

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  return new Promise((resolve, reject) => {
    recorder.onerror = () => reject(new Error("Recording failed"));

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const baseName = video.name.replace(/\.[^.]+$/, "");
      a.href = url;
      a.download = `${baseName}_edited.webm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      resolve();
    };

    // Seek to trim start, then start recording
    videoEl.currentTime = trim.start;
    videoEl.muted = false;
    videoEl.volume = Math.min(1, state.volume);
    videoEl.playbackRate = state.speed;

    const onSeeked = () => {
      videoEl.removeEventListener("seeked", onSeeked);
      recorder.start(100); // collect chunks every 100ms
      videoEl.play();

      const startedAt = Date.now();
      let rafId: number;

      const tick = () => {
        const elapsed = (Date.now() - startedAt) / 1000;
        const pct = Math.min(100, (elapsed / (duration / state.speed)) * 100);
        onProgress(pct);
        drawFrame(ctx, videoEl, canvas, state, videoEl.currentTime);

        if (videoEl.currentTime >= trim.end) {
          videoEl.pause();
          cancelAnimationFrame(rafId);
          recorder.stop();
          return;
        }
        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
    };

    videoEl.addEventListener("seeked", onSeeked);
  });
}

// ── HD server export ──────────────────────────────────────────────────────────

export interface HDExportResult {
  projectId: string;
}

export async function exportHD(
  state: EditorState,
  token: string,
  onProgress: (label: string, pct: number) => void,
): Promise<HDExportResult> {
  if (!state.video) throw new Error("No video loaded");

  let videoUrl = state.video.s3Url ?? (state.video.file ? undefined : state.video.url);

  // If we only have a local File (not yet on S3), upload it first
  if (!videoUrl && state.video.file) {
    onProgress("Uploading to server…", 10);
    const form = new FormData();
    form.append("file", state.video.file);
    const upRes = await fetch("/api/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!upRes.ok) {
      const d = await upRes.json().catch(() => ({}));
      throw new Error((d as { error?: string }).error || "Upload failed");
    }
    const upData = await upRes.json() as { url: string };
    videoUrl = upData.url;
  }

  if (!videoUrl) throw new Error("Could not resolve video URL for server render");

  onProgress("Sending to renderer…", 30);

  // Build a minimal EditorDoc compatible with the existing render route
  const doc = {
    videoUrl,
    durationSec: state.video.duration,
    aspect: "original" as const,
    trimStart: state.trim.start,
    trimEnd: state.trim.end,
    captions: { enabled: state.captions.length > 0, styleIndex: 0, mode: "lines" as const, segments: [] },
    textOverlays: [],
    imageOverlays: [],
  };

  const renderRes = await fetch("/api/editor/render", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ doc, tool: "simple-editor" }),
  });
  if (!renderRes.ok) {
    const d = await renderRes.json().catch(() => ({}));
    throw new Error((d as { error?: string }).error || "Render failed");
  }
  const renderData = await renderRes.json() as { projectId: string };
  onProgress("Rendering on server…", 50);

  return { projectId: renderData.projectId };
}
