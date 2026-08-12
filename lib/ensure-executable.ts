import fs from "fs";

// Restore the execute bit on a bundled binary at runtime.
//
// ffmpeg-static and youtube-dl-exec ship their binaries with +x set by their
// postinstall, but that bit does NOT reliably survive the way a Next.js
// `output: "standalone"` build is packaged and then extracted onto a host.
// On clipiro.com's Hostinger deploy the ffmpeg binary arrived present but
// non-executable, so every spawn failed with EACCES — which broke not just
// AutoClip but all rendering, thumbnails and audio extraction.
//
// The build can `chmod` the copy (see scripts/postbuild.js), but that can't
// help if the bit is lost DURING the host's own extraction step, after our
// build has run. Fixing it here — when the binary is resolved, in the running
// process — is the only place guaranteed to be after every copy/extract.
//
// Best-effort by design: a bare PATH name ("ffmpeg"), a Windows binary, a
// read-only filesystem, or a binary that is already executable must never
// throw. It runs once per binary per process.
const ensured = new Set<string>();

export function ensureExecutable(binPath: string): void {
  if (process.platform === "win32") return;      // no POSIX exec bit
  if (!binPath || !binPath.includes("/")) return; // bare PATH name, not a file we own
  if (ensured.has(binPath)) return;
  ensured.add(binPath);
  try {
    if (!fs.existsSync(binPath)) return;
    const mode = fs.statSync(binPath).mode;
    // Already runnable by the owner? leave it alone.
    if (mode & 0o100) return;
    fs.chmodSync(binPath, 0o755);
  } catch {
    // Read-only FS or insufficient perms: nothing we can do here, and the
    // subsequent spawn will surface a clear EACCES (see probeMediaDuration).
  }
}
