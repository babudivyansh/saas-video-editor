/**
 * Fails the build unless the yt-dlp this deploy will use actually runs.
 *
 *   npm run verify:ytdlp
 *
 * Executes the REAL binary lib/ytdlp.ts resolves at runtime with --version.
 * On Linux x64 (production) it must also be the pinned standalone build from
 * scripts/install-ytdlp.mjs, reporting the pinned version.
 *
 * This exists because production shipped youtube-dl-exec's Linux `yt-dlp` —
 * a Python zipapp — onto a host with Python 3.9, and it crashed on every
 * call. The build stayed green: nothing ever ran the binary before users did.
 * No network is used, so this cannot flake on YouTube.
 */

import { spawnSync } from "child_process";
import { YTDLP_BIN } from "../lib/ytdlp";
import { PINNED, YTDLP_PATH } from "./install-ytdlp.mjs";

function fail(msg: string): never {
  console.error(`\nYT-DLP RUNTIME FAILED — ${msg}`);
  console.error("The YouTube/Instagram downloaders and AutoClip URL import would all fail. Not deploying.");
  process.exit(1);
}

console.log("--- yt-dlp runtime verification ---");
console.log(`binary   : ${YTDLP_BIN}`);
console.log(`platform : ${process.platform}/${process.arch}`);

const production = process.platform === "linux" && process.arch === "x64";
if (production && YTDLP_BIN !== YTDLP_PATH) {
  fail(`expected the pinned standalone build at ${YTDLP_PATH} (run: node scripts/install-ytdlp.mjs).`);
}

const r = spawnSync(YTDLP_BIN, ["--version"], { encoding: "utf8", timeout: 60_000, windowsHide: true });
if (r.error) fail(`could not start it: ${r.error.message}`);
const version = (r.stdout ?? "").trim();
if (r.status !== 0 || !version) {
  const lastLine = (r.stderr ?? "").trim().split(/\r?\n/).pop() ?? "";
  fail(`exited ${r.status}: ${lastLine || "no output"}`);
}
console.log(`version  : ${version}`);

if (production && version !== PINNED.version) {
  fail(`reports ${version}, but the pin is ${PINNED.version}.`);
}

console.log("\nYT-DLP RUNTIME OK");
