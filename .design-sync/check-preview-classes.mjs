#!/usr/bin/env node
// Flags className tokens in .design-sync/previews/*.tsx that do NOT exist in
// the shipped CSS (ds-bundle/_ds_bundle.css).
//
// Why this exists: the synced CSS is Tailwind's compile of the APP, so it holds
// only the utility classes some app file actually uses. A preview (or a design
// the agent builds) that writes `min-h-[272px]` or `pb-52` gets no style at all
// — silently. The ToastProvider card shipped mispositioned exactly that way.
//
//   node .design-sync/check-preview-classes.mjs      (after package-build)
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync("ds-bundle/_ds_bundle.css", "utf8");

// Every class selector in the compiled CSS, unescaped back to its class name.
const defined = new Set();
for (const m of css.matchAll(/\.((?:\\.|[\w-])+)/g)) defined.add(m[1].replace(/\\(.)/g, "$1"));

const dir = ".design-sync/previews";
let missing = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith(".tsx"))) {
  const src = readFileSync(join(dir, f), "utf8");
  for (const m of src.matchAll(/className="([^"]+)"/g)) {
    for (const cls of m[1].split(/\s+/).filter(Boolean)) {
      if (!defined.has(cls)) {
        console.log(`MISSING  ${cls.padEnd(28)} ${f}`);
        missing++;
      }
    }
  }
}
console.log(missing ? `\n${missing} class use(s) with no rule in the shipped CSS` : "✓ every preview class exists in the shipped CSS");
process.exit(missing ? 1 : 0);
