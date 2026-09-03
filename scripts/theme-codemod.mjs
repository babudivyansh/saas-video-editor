#!/usr/bin/env node
// Light → dark class rewriter for the 2026-09 emerald design-system migration.
//
// WHY A SCANNER AND NOT A REGEX: className strings here are built with template
// literals and ternaries, and the codebase documents its own class choices in
// prose comments — app/components/ui/Button.tsx and MarketingShell.tsx both
// discuss `bg-white` in comments, and the chart tests hold brand hexes as test
// DATA. A whole-file regex would silently rewrite all of that. So this walks
// the TypeScript AST and only ever edits the inside of a string literal or
// template chunk. Comments and JSX text are never yielded as literals, so they
// are skipped for free.
//
// This is a STARTING POINT per file, not the finish. Class rewriting cannot
// judge whether a surface is a card, an overlay or a hero — always read the
// --dry-run diff before applying, and read `git diff` before committing.
//
//   node scripts/theme-codemod.mjs --report
//   node scripts/theme-codemod.mjs --files app/dashboard/clips --dry-run
//   node scripts/theme-codemod.mjs --files app/dashboard/clips --apply

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// ── Denylist ───────────────────────────────────────────────────────────────
// Hard-coded, NOT overridable by --files. Two different reasons to be here.

// (a) Surfaces that must stay light, or are already dark, or aren't ours.
const DENY_PATHS = [
  "lib/email",                    // email clients; dark email is its own project
  "lib/social/reports",           // printed PDF on white paper
  "app/opengraph-image.tsx",      // Satori social cards, own background
  "app/twitter-image.tsx",
  "app/dashboard/editor",         // already dark, owns the --editor-* token set
  // app/admin came off this list when the admin panel was migrated too.
  "design-system",                // vendored, already eslint-ignored
  "ds-bundle",
  ".ds-sync",
  ".design-sync",
  "e2e",
  "scripts",
];
const DENY_FILE_RE = [/\.test\.tsx?$/, /opengraph-image\.tsx$/, /twitter-image\.tsx$/];

// (b) Files whose colours are PRODUCT OUTPUT, not chrome. These render what the
// exported video will look like — third-party app mockups (WhatsApp, Telegram,
// iMessage, Reddit) and caption style presets that ffmpeg burns into the frame.
// Recolouring them corrupts the product. Chrome in these files is migrated by
// hand, hunk by hunk.
const CONTENT_DENY = [
  "app/dashboard/create/text-video/page.tsx",
  "app/dashboard/create/reddit-video/page.tsx",
  // streamer-video came off this list after review: every gray in it is page
  // chrome, and its product output (the OUTLINE text-shadow and the caption
  // presets) lives in inline style strings a class rewriter cannot reach.
  // NOTE: app/components/dashboard/toolPreviews.tsx was on this list, but it
  // draws CLIPIRO's own UI, not a third-party app's — so it should follow the
  // theme like everything else. Only the WhatsApp/Telegram/iMessage/Reddit
  // renderings above are genuinely product output.
];

// ── Rules ──────────────────────────────────────────────────────────────────
// Keyed by the class BASE (no variant prefix, no /alpha). A token only matches
// if it carries no alpha modifier: `bg-white/15` is a translucent overlay on a
// dark ground and is already correct, so it must never be swept up with the
// opaque `bg-white`.
const RULES = {
  // Surfaces
  "bg-white": "bg-panel",
  "bg-gray-50": "bg-surface-2",
  "bg-gray-100": "bg-surface-3",
  "bg-gray-200": "bg-surface-3",
  "bg-slate-50": "bg-surface-2",
  "bg-slate-100": "bg-surface-3",
  "bg-zinc-950": "bg-bg",
  "bg-zinc-900": "bg-surface-2",
  "bg-zinc-800": "bg-surface-3",

  // Foreground
  "text-gray-900": "text-fg",
  "text-gray-800": "text-fg",
  "text-gray-700": "text-fg",
  "text-gray-600": "text-fg-muted",
  "text-gray-500": "text-fg-muted",
  "text-gray-400": "text-fg-subtle",
  "text-slate-900": "text-fg",
  "text-slate-800": "text-fg",
  "text-slate-700": "text-fg",
  "text-slate-600": "text-fg-muted",
  "text-slate-500": "text-fg-muted",
  "text-slate-400": "text-fg-subtle",
  "text-zinc-100": "text-fg",
  "text-zinc-300": "text-fg-muted",
  "text-zinc-400": "text-fg-muted",
  "text-zinc-500": "text-fg-subtle",
  "text-zinc-600": "text-fg-subtle",

  // Lines
  "border-gray-50": "border-line",
  "border-gray-100": "border-line",
  "border-gray-200": "border-line",
  "border-gray-300": "border-line-strong",
  "border-slate-200": "border-line",
  "border-zinc-700": "border-line",
  "border-zinc-800": "border-line",
  "border-zinc-900": "border-line",
  "divide-gray-100": "divide-line",
  "divide-gray-200": "divide-line",
  "placeholder-gray-400": "placeholder-fg-subtle",
  "ring-gray-100": "ring-line",
  "ring-gray-200": "ring-line",

  // Status — lime is branding, not every state.
  "text-red-500": "text-error",
  "text-red-600": "text-error",
  "bg-red-50": "bg-error/10",
  "border-red-200": "border-error/40",
  "border-red-300": "border-error/60",
  "text-green-500": "text-success",
  "text-green-600": "text-success",
  "text-amber-500": "text-warning",
  "text-amber-600": "text-warning",

  // Old brand hexes → tokens
  "text-[#335CFF]": "text-brand",
  "bg-[#335CFF]": "bg-brand",
  "border-[#335CFF]": "border-brand",
};

// Tokens that must NEVER be rewritten even though a rule might seem to apply.
const NEVER = new Set(["print:bg-white"]);

// `text-white` is correct on 340 sites (hero overlays, gradient fills). It is
// only wrong where the fill became lime, which needs near-black text. Rewrite
// it ONLY when the same string literal also carries the fill class.
const LIME_FILL_RE = /\b(?:grad-brand|bg-brand)\b/;

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
// Escape hatch for the content-denylisted files. Their CHROME still has to be
// migrated even though their mockup regions must not be, so --allow-content is
// only ever used together with --protect <start-end> ranges naming the
// product-output components (the chat/Reddit renderings), which are then
// excluded from rewriting.
const allowContent = argv.includes("--allow-content");
const protect = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--protect") {
    while (argv[i + 1] && !argv[i + 1].startsWith("--")) {
      const [a, b] = argv[++i].split("-").map(Number);
      protect.push([a, b]);
    }
  }
}
if (allowContent && !protect.length) {
  console.error("--allow-content requires --protect <start-end> …; refusing to rewrite a whole content file.");
  process.exit(1);
}
const report = argv.includes("--report");
const fileArgs = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--files") {
    while (argv[i + 1] && !argv[i + 1].startsWith("--")) fileArgs.push(argv[++i]);
  }
}


// ── Token rewriting ────────────────────────────────────────────────────────

function rewriteToken(token, literal) {
  if (NEVER.has(token)) return token;

  // Split `md:hover:bg-gray-50/60` into prefixes, base, alpha.
  const slash = token.lastIndexOf("/");
  const hasAlpha = slash > 0 && !token.slice(slash + 1).includes("]");
  if (hasAlpha) return token; // translucent — already correct on dark

  const lastColon = token.lastIndexOf(":");
  const prefix = lastColon === -1 ? "" : token.slice(0, lastColon + 1);
  const base = lastColon === -1 ? token : token.slice(lastColon + 1);

  if (base === "text-white") {
    return LIME_FILL_RE.test(literal) ? prefix + "text-on-primary" : token;
  }
  const mapped = RULES[base];
  return mapped ? prefix + mapped : token;
}

function rewriteLiteral(text) {
  if (!/\s|-/.test(text)) return text;
  const parts = text.split(/(\s+)/);
  let changed = false;
  const out = parts.map((p) => {
    if (/^\s*$/.test(p) || !p) return p;
    const next = rewriteToken(p, text);
    if (next !== p) changed = true;
    return next;
  });
  if (!changed) return text;
  // A rewrite can collapse two distinct classes into the same one.
  const deduped = out.join("").split(/\s+/).filter(Boolean);
  const seen = new Set();
  const unique = deduped.filter((t) => (seen.has(t) ? false : (seen.add(t), true)));
  return text.startsWith(" ") || text.endsWith(" ")
    ? (text.startsWith(" ") ? " " : "") + unique.join(" ") + (text.endsWith(" ") ? " " : "")
    : unique.join(" ");
}

const REWRITABLE = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
]);

function processFile(abs) {
  const src = readFileSync(abs, "utf8");
  const sf = ts.createSourceFile(abs, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let edits = [];

  (function walk(node) {
    if (REWRITABLE.has(node.kind)) {
      // Inner span only — never touch the quote/backtick delimiters or the
      // `${` / `}` of a template chunk.
      const full = node.getText();
      let open = 1;
      let close = 1;
      if (node.kind === ts.SyntaxKind.TemplateHead) close = 2;            // `...${
      else if (node.kind === ts.SyntaxKind.TemplateMiddle) { open = 1; close = 2; } // }...${
      else if (node.kind === ts.SyntaxKind.TemplateTail) open = 1;        // }...`
      const s = node.getStart() + open;
      const e = node.getStart() + full.length - close;
      if (e > s) {
        const raw = src.slice(s, e);
        const out = rewriteLiteral(raw);
        if (out !== raw) edits.push({ s, e, raw, out });
      }
    }
    node.forEachChild(walk);
  })(sf);

  if (protect.length) {
    const lineOf = (i) => src.slice(0, i).split(/\n/).length;
    edits = edits.filter((e) => !protect.some(([a, b]) => lineOf(e.s) >= a && lineOf(e.s) <= b));
  }
  if (!edits.length) return null;
  let next = src;
  for (const ed of [...edits].sort((a, b) => b.s - a.s)) {
    next = next.slice(0, ed.s) + ed.out + next.slice(ed.e);
  }
  return { next, edits, src };
}

// ── CLI ────────────────────────────────────────────────────────────────────

function isDenied(rel) {
  if (DENY_PATHS.some((p) => rel === p || rel.startsWith(p + "/"))) return "denylist";
  if (DENY_FILE_RE.some((re) => re.test(rel))) return "denylist";
  if (CONTENT_DENY.includes(rel) && !allowContent) return "content-denylist (product output — needs --allow-content plus --protect ranges)";
  return null;
}

function collect(target, out = []) {
  const abs = join(ROOT, target);
  if (!statSync(abs).isDirectory()) {
    out.push(abs);
    return out;
  }
  for (const entry of readdirSync(abs)) {
    const childRel = join(target, entry).split("\\").join("/");
    if (isDenied(childRel)) continue;
    const childAbs = join(ROOT, childRel);
    if (statSync(childAbs).isDirectory()) collect(childRel, out);
    else if (/\.tsx?$/.test(entry)) out.push(childAbs);
  }
  return out;
}

if (report) {
  const targets = collect("app");
  const tally = new Map();
  for (const abs of targets) {
    const r = processFile(abs);
    if (!r) continue;
    tally.set(relative(ROOT, abs).split("\\").join("/"), r.edits.length);
  }
  const rows = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((n, [, v]) => n + v, 0);
  console.log(`${total} rewritable literal(s) across ${rows.length} file(s):\n`);
  for (const [f, n] of rows.slice(0, 40)) console.log(`  ${String(n).padStart(4)}  ${f}`);
  if (rows.length > 40) console.log(`  … and ${rows.length - 40} more files`);
  console.log(`\nContent-denylisted (hand-migrate): ${CONTENT_DENY.join(", ")}`);
  process.exit(0);
}

if (!fileArgs.length) {
  console.error("Usage: theme-codemod.mjs --files <path…> [--dry-run|--apply]\n       theme-codemod.mjs --report");
  process.exit(1);
}

let files = [];
for (const t of fileArgs) {
  const rel = t.split("\\").join("/").replace(/^\.\//, "");
  const why = isDenied(rel);
  if (why) {
    console.error(`✗ refusing ${rel} — ${why}`);
    process.exit(1);
  }
  files = files.concat(collect(rel));
}

let changedFiles = 0;
let changedTokens = 0;
for (const abs of files) {
  const rel = relative(ROOT, abs).split("\\").join("/");
  if (isDenied(rel)) continue;
  const r = processFile(abs);
  if (!r) continue;
  changedFiles++;
  for (const ed of r.edits) {
    const line = r.src.slice(0, ed.s).split("\n").length;
    const before = ed.raw.trim().slice(0, 72);
    const after = ed.out.trim().slice(0, 72);
    console.log(`${rel}:${line}\n  - ${before}\n  + ${after}`);
    changedTokens++;
  }
  if (apply) writeFileSync(abs, r.next, "utf8");
}

console.log(
  `\n${apply ? "Applied" : "Would change"} ${changedTokens} literal(s) in ${changedFiles} file(s).` +
    (apply ? "" : "  Re-run with --apply once the diff above looks right."),
);

// Batch discipline: a diff bigger than this stops being reviewable.
if (!apply && (changedFiles > 25 || changedTokens > 200)) {
  console.log(
    `\n⚠ Batch is large (${changedFiles} files / ${changedTokens} literals). Split it —\n` +
      `  the point of this script is a diff you can actually read end to end.`,
  );
}
