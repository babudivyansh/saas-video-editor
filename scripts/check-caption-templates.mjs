#!/usr/bin/env node
// Lint gate for the caption template library (part of `npm run lint`).
//
// Fails when:
//   - template ids are not unique, or any id is not a lowercase slug
//   - two templates share font + motion + container + accent colour (each
//     template must look distinct, which is the point of having 50)
//   - a template's font has no bundled file in lib/captions/engine/font-manifest.json
//   - an emoji the planner or a preview can show has no PNG in public/emoji
//   - a legacy alias points at a template that doesn't exist

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CAPTION_TEMPLATES, LEGACY_TEMPLATE_ALIASES, parseCaptionSample } from "../packages/shared/src/captions/templates.ts";
import { EMOJI_SET, emojiAssetName } from "../packages/shared/src/captions/emoji.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "lib/captions/engine/font-manifest.json"), "utf8"));
const bundled = new Set(manifest.map((f) => f.family));
const problems = [];

const ids = new Set();
for (const t of CAPTION_TEMPLATES) {
  if (ids.has(t.id)) problems.push(`duplicate id "${t.id}"`);
  ids.add(t.id);
  if (!/^[a-z0-9-]+$/.test(t.id)) problems.push(`id "${t.id}" is not a lowercase slug`);
  if (!bundled.has(t.type.font)) problems.push(`${t.id}: font "${t.type.font}" is not bundled (run scripts/sync-caption-fonts.mjs)`);
}

const looks = new Map();
for (const t of CAPTION_TEMPLATES) {
  const key = [t.type.font, t.motion, t.container, t.colors.accent.toUpperCase()].join("|");
  if (looks.has(key)) problems.push(`${t.id} looks the same as ${looks.get(key)} (font + motion + container + accent)`);
  else looks.set(key, t.id);
}

const emoji = new Set(EMOJI_SET);
for (const t of CAPTION_TEMPLATES) for (const tok of parseCaptionSample(t.sample)) if (tok.emoji) emoji.add(tok.emoji);
for (const e of emoji) {
  if (!fs.existsSync(path.join(ROOT, "public/emoji", emojiAssetName(e)))) problems.push(`emoji ${e} has no image (run scripts/sync-caption-emoji.mjs)`);
}

for (const [from, to] of Object.entries(LEGACY_TEMPLATE_ALIASES)) {
  if (!ids.has(to)) problems.push(`legacy alias "${from}" points at missing template "${to}"`);
  if (ids.has(from)) problems.push(`legacy alias "${from}" shadows a current template id`);
}

if (problems.length) {
  console.error(`✗ caption templates: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`✓ caption templates — ${CAPTION_TEMPLATES.length} unique templates, ${bundled.size} bundled font families, ${emoji.size} emoji images`);
