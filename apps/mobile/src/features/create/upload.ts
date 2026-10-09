import type { Asset, AutoClipSettings, UploadStart } from "@clipiro/shared";
import { assets } from "@/lib/api";

// Sends a video from the phone straight to storage (S3 multipart, through
// /api/mobile/v1/uploads): the server signs a URL per 10 MB part, the phone
// PUTs each part, and /uploads/complete turns the parts into an Asset.
//
// Every finished part is written to disk with its ETag, so an upload stopped
// by a lost connection, the app going to the background, or the app being
// killed carries on from the next part instead of starting again.

export type UploadFile = {
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  durationSec?: number | null;
  width?: number;
  height?: number;
};

/** The AutoClip run waiting on this upload, so a resumed upload can still start it. */
export type PendingRun = { settings: AutoClipSettings; allowCreditOverflow?: boolean };

/** What's kept on disk while an upload is under way. */
export type SavedUpload = {
  file: UploadFile;
  /** The AutoClip run to start once it lands (null for a plain Assets upload). */
  run: PendingRun | null;
  key: string;
  uploadId: string;
  partSizeBytes: number;
  /** partNumber → ETag, for every part already in storage. */
  etags: Record<number, string>;
};

/** File access, kept apart so the upload logic can be tested without a phone. */
export interface UploadIO {
  /** Copies `length` bytes at `offset` of the file into a temporary file; returns its uri. */
  readPart(uri: string, offset: number, length: number): Promise<string>;
  /** PUTs a part file to a signed URL. */
  putPart(partUri: string, url: string, onBytes: (sent: number) => void, signal: AbortSignal): Promise<{ status: number; etag: string | null }>;
  /** The picked copy lives in the app cache, which Android may clear. */
  fileExists(uri: string): boolean;
  load(): Promise<SavedUpload | null>;
  save(s: SavedUpload | null): Promise<void>;
}

/** The upload can't go on (the server or storage refused it); not a lost connection. */
export class UploadRefused extends Error {}

export const partCount = (s: Pick<SavedUpload, "file" | "partSizeBytes">) => Math.max(1, Math.ceil(s.file.sizeBytes / s.partSizeBytes));

/** Starts a multipart upload and saves it, so it can resume. */
export async function beginUpload(io: UploadIO, file: UploadFile, run: PendingRun | null = null): Promise<{ saved: SavedUpload; urls: Map<number, string> }> {
  const start: UploadStart = await assets.startUpload({ name: file.name, mimeType: file.mimeType, sizeBytes: file.sizeBytes });
  const saved: SavedUpload = { file, run, key: start.key, uploadId: start.uploadId, partSizeBytes: start.partSizeBytes, etags: {} };
  await io.save(saved);
  return { saved, urls: new Map(start.parts.map((p) => [p.partNumber, p.url])) };
}

/**
 * Sends every part still missing, then completes the upload into an Asset
 * and forgets the saved state. `urls` may be empty (a resume): signed URLs
 * last an hour, so missing or expired ones are fetched again.
 */
export async function sendParts(
  io: UploadIO,
  saved: SavedUpload,
  urls: Map<number, string>,
  o: { signal: AbortSignal; onProgress?: (fraction: number) => void },
): Promise<Asset> {
  const total = partCount(saved);
  const size = saved.file.sizeBytes;
  const partBytes = (n: number) => Math.min(saved.partSizeBytes, size - (n - 1) * saved.partSizeBytes);
  const doneBytes = () => Object.keys(saved.etags).reduce((sum, n) => sum + partBytes(Number(n)), 0);
  const report = (extra: number) => o.onProgress?.(Math.min(1, (doneBytes() + extra) / size));
  report(0);

  const missing = Array.from({ length: total }, (_, i) => i + 1).filter((n) => !saved.etags[n]);
  const refresh = async (numbers: number[]) => {
    for (let i = 0; i < numbers.length; i += 500) {
      const { parts } = await assets.partUrls({ key: saved.key, uploadId: saved.uploadId, partNumbers: numbers.slice(i, i + 500) });
      for (const p of parts) urls.set(p.partNumber, p.url);
    }
  };
  const needUrls = missing.filter((n) => !urls.has(n));
  if (needUrls.length) await refresh(needUrls);

  for (const n of missing) {
    if (o.signal.aborted) throw o.signal.reason ?? new Error("aborted");
    const partUri = await io.readPart(saved.file.uri, (n - 1) * saved.partSizeBytes, partBytes(n));
    let res = await io.putPart(partUri, urls.get(n)!, report, o.signal);
    if (res.status === 403) {
      // The signed URL expired (the phone slept past the hour): sign it again, once.
      await refresh([n]);
      res = await io.putPart(partUri, urls.get(n)!, report, o.signal);
    }
    if (res.status < 200 || res.status >= 300 || !res.etag) throw new UploadRefused(`Storage refused part ${n} (${res.status})`);
    saved.etags[n] = res.etag;
    await io.save(saved);
    report(0);
  }

  const asset = await assets.completeUpload({
    key: saved.key,
    uploadId: saved.uploadId,
    name: saved.file.name,
    mimeType: saved.file.mimeType,
    parts: Object.entries(saved.etags)
      .map(([partNumber, etag]) => ({ partNumber: Number(partNumber), etag }))
      .sort((a, b) => a.partNumber - b.partNumber),
    // A known length lets the server check Clip Minutes before the run starts.
    durationSec: saved.file.durationSec ?? undefined,
    width: saved.file.width,
    height: saved.file.height,
  });
  await io.save(null);
  return asset;
}

/** Gives up on an upload: storage drops the parts, the phone forgets it. Never throws. */
export async function abandonUpload(io: UploadIO, saved: SavedUpload | null) {
  await io.save(null).catch(() => {});
  if (saved) await assets.abortUpload({ key: saved.key, uploadId: saved.uploadId }).catch(() => {});
}
