import "dotenv/config";
import fs from "fs";
import path from "path";
import { uploadFileToS3 } from "../utils/s3-upload";

// Uploads the locally-generated sample backgrounds to S3 under backgrounds/.
const FILES = [
  "subway-surfers.mp4",
  "soap.mp4",
  "minecraft.mp4",
  "mario-kart.mp4",
  "slime.mp4",
];

async function main() {
  const dir = path.join(process.cwd(), ".tmp-bg");
  for (const f of FILES) {
    const local = path.join(dir, f);
    if (!fs.existsSync(local)) throw new Error(`missing ${local}`);
    const url = await uploadFileToS3(local, `backgrounds/${f}`, "video/mp4");
    console.log(`uploaded ${f} -> ${url}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); });
