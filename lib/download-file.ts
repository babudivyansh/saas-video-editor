// Client-safe (no imports): save a result to the user's device.
//
// Media URLs are presigned S3 links on another origin. Browsers ignore the
// `download` attribute cross-origin, so linking straight at one navigates the
// tab to amazonaws.com and plays the file instead of saving it. Cross-origin
// URLs are routed through /api/media/download, which redirects to an S3 URL
// signed with `Content-Disposition: attachment` — the browser saves it and
// the page stays put. Same-origin, blob: and data: URLs download as-is.

/** An href that downloads `src` as `filename` instead of opening it. */
export function downloadHref(src: string, filename?: string): string {
  if (/^(blob:|data:)/.test(src) || (src.startsWith("/") && !src.startsWith("//"))) return src;
  const qs = new URLSearchParams({ src });
  if (filename) qs.set("name", filename);
  return `/api/media/download?${qs.toString()}`;
}

/** Start a download of `src` from code (after a poll finishes, etc.). */
export function downloadFile(src: string, filename?: string): void {
  const a = document.createElement("a");
  a.href = downloadHref(src, filename);
  if (filename) a.download = filename;
  else a.download = "";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
