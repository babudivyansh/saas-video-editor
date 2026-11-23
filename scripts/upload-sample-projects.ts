import "dotenv/config";
import fs from "fs";
import path from "path";
import { uploadFileToS3 } from "../utils/s3-upload";
import { SAMPLE_VIDEOS, sampleThumbnailKey, sampleVideoKey } from "../lib/sample-projects";

// Uploads the cuts scripts/build-sample-projects.sh made to their shared keys
// under samples/. Do this before running the demo projects' AutoClip runs
// (lib/demo-projects.ts) in a new environment. Usage: npx tsx scripts/upload-sample-projects.ts <folder with the cuts>

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("usage: upload-sample-projects.ts <folder with podcast.mp4, gaming.mp4, vlog.mp4 and their .jpg>");
  for (const s of SAMPLE_VIDEOS) {
    for (const [file, key, type] of [
      [`${s.id}.mp4`, sampleVideoKey(s.id), "video/mp4"],
      [`${s.id}.jpg`, sampleThumbnailKey(s.id), "image/jpeg"],
    ] as const) {
      const local = path.join(dir, file);
      if (!fs.existsSync(local)) throw new Error(`missing ${local}`);
      await uploadFileToS3(local, key, type);
      console.log(`uploaded ${file} -> ${key}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
