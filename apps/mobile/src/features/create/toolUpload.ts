import type { Asset } from "@clipiro/shared";
import { beginUpload, sendParts, type UploadFile, type UploadIO } from "./upload";
import { deviceUploadIO } from "./uploadIo";

// A file from the phone into Assets, for a tool that takes it from there
// (Enhance speech, Vocal remover): the same direct-to-storage upload as
// AutoClip, but nothing kept to resume — the person is watching it.

let io: UploadIO = { ...deviceUploadIO, load: async () => null, save: async () => {} };
/** Tests swap the file access. */
export function setToolUploadIO(next: UploadIO) {
  io = { ...next, load: async () => null, save: async () => {} };
}

export async function uploadToAssets(file: UploadFile, onProgress: (fraction: number) => void): Promise<Asset> {
  const { saved, urls } = await beginUpload(io, file);
  return sendParts(io, saved, urls, { signal: new AbortController().signal, onProgress });
}
