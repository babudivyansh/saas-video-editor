#!/usr/bin/env node
// Downloads a 128px colour PNG for every emoji the caption planner can emit
// (packages/shared/src/captions/emoji.ts EMOJI_SET) plus every emoji in a
// template's preview line, into public/emoji/.
//
// Captions draw emoji as image overlays because libass cannot render colour
// emoji glyphs. Images: Noto Emoji (Apache 2.0), see public/emoji/LICENSE.md.
// Re-run after adding a keyword with a new emoji:
//   node scripts/sync-caption-emoji.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EMOJI_SET, emojiAssetName } from "../packages/shared/src/captions/emoji.ts";
import { CAPTION_TEMPLATES, parseCaptionSample } from "../packages/shared/src/captions/templates.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "emoji");
const BASE = "https://raw.githubusercontent.com/googlefonts/noto-emoji/main/2D/png/128/";

const wanted = new Set(EMOJI_SET);
for (const t of CAPTION_TEMPLATES) for (const tok of parseCaptionSample(t.sample)) if (tok.emoji) wanted.add(tok.emoji);

fs.mkdirSync(OUT, { recursive: true });
let fetched = 0;
for (const emoji of wanted) {
  const name = emojiAssetName(emoji);
  const dest = path.join(OUT, name);
  if (fs.existsSync(dest)) continue;
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`${emoji} (${name}): ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  fetched++;
}
process.stdout.write(`${wanted.size} emoji, ${fetched} downloaded\n`);
