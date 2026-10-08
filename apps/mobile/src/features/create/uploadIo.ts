import { File, Paths } from "expo-file-system";
import type { SavedUpload, UploadIO } from "./upload";

// The phone side of the upload: reads one part of the picked video into a
// temporary file and PUTs it (expo-file-system reports progress and returns
// the ETag header S3 needs). The upload's progress lives in a JSON file in
// the app's documents folder, so it survives the app being killed.

const STATE = () => new File(Paths.document, "autoclip-upload.json");
const PART = () => new File(Paths.cache, "autoclip-upload-part.bin");

export const deviceUploadIO: UploadIO = {
  async readPart(uri, offset, length) {
    const handle = new File(uri).open();
    try {
      handle.offset = offset;
      const bytes = handle.readBytes(length);
      const part = PART();
      if (part.exists) part.delete();
      part.create();
      part.write(bytes);
      return part.uri;
    } finally {
      handle.close();
    }
  },

  async putPart(partUri, url, onBytes, signal) {
    const res = await new File(partUri).upload(url, { httpMethod: "PUT", onProgress: (p) => onBytes(p.bytesSent), signal });
    const etag = Object.entries(res.headers).find(([k]) => k.toLowerCase() === "etag")?.[1] ?? null;
    return { status: res.status, etag };
  },

  async load() {
    try {
      const f = STATE();
      if (!f.exists) return null;
      return JSON.parse(await f.text()) as SavedUpload;
    } catch {
      return null;
    }
  },

  fileExists: (uri) => new File(uri).exists,

  async save(s) {
    const f = STATE();
    if (s == null) {
      if (f.exists) f.delete();
      return;
    }
    if (!f.exists) f.create();
    f.write(JSON.stringify(s));
  },
};
