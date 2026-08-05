// Render every registered email to a single self-contained review page.
//
//   npx tsx scripts/preview-emails.ts
//
// Writes .email-preview/index.html plus one .html and one .txt per sample, so a
// real file can be dragged into Outlook or uploaded to a rendering service —
// which an iframe can never stand in for.
//
// Runs with no .env at all. That is the payoff of keeping lib/email/tokens.ts
// off lib/env: nothing in the render path parses the environment schema.

import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { renderEmail } from "../lib/email/layout";
import {
  EMAIL_REGISTRY,
  GROUP_LABELS,
  GROUP_ORDER,
  type EmailGroup,
  type TemplateEntry,
} from "../lib/email/templates/registry";
import { COLOR, LOGO_URL, LOGO_WIDTH } from "../lib/email/tokens";

const OUT_DIR = join(process.cwd(), ".email-preview");

/**
 * Inline the real logo for the preview.
 *
 * Production points at https://clipiro.com/logo.png, which is live — but a
 * preview page cannot reach an external host, so the same file is read from
 * public/ and embedded as a data URI. It is downscaled to twice its display
 * width first: the source is 760px wide for a 120px slot, and embedding it at
 * full size 110 times (two iframes per sample) would add megabytes to the page
 * for pixels no one sees.
 *
 * Only the preview substitutes anything — the emitted HTML keeps the real URL.
 */
async function logoDataUri(): Promise<string> {
  const source = readFileSync(join(process.cwd(), "public", "logo.png"));
  // loadImage, not `new Image()` with a Buffer src — the latter decodes nothing
  // here and silently yields a blank canvas (a 185-byte transparent PNG).
  const img = await loadImage(source);

  const w = LOGO_WIDTH * 2;
  const h = Math.round((img.height / img.width) * w);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  return `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`;
}

function withPreviewAssets(htmlDoc: string, logoDataUrl: string): string {
  return htmlDoc.split(LOGO_URL).join(logoDataUrl);
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface Rendered {
  entry: TemplateEntry<never>;
  sample: string;
  subject: string;
  preheader: string;
  html: string;
  text: string;
  slug: string;
}

function renderAll(logoDataUrl: string): Rendered[] {
  const out: Rendered[] = [];
  for (const entry of Object.values(EMAIL_REGISTRY)) {
    for (const [sample, props] of Object.entries(entry.samples)) {
      const doc = entry.build(props as never);
      const r = renderEmail({
        ...doc,
        // Non-transactional mail carries an unsubscribe link, so the footer in
        // the preview matches what would really be sent.
        unsubscribeUrl:
          entry.category === "transactional"
            ? undefined
            : "https://clipiro.com/api/email/unsubscribe?t=preview-token",
      });
      out.push({
        entry,
        sample,
        subject: r.subject,
        preheader: doc.preheader,
        html: withPreviewAssets(r.html, logoDataUrl),
        text: r.text,
        slug: `${entry.id}.${sample.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
      });
    }
  }
  return out;
}

function card(r: Rendered): string {
  return `
  <section class="card" id="${esc(r.slug)}">
    <header class="card-h">
      <div>
        <h3>${esc(r.entry.title)}${r.entry.samples && Object.keys(r.entry.samples).length > 1 ? ` <span class="sample">${esc(r.sample)}</span>` : ""}</h3>
        <p class="trigger">${esc(r.entry.trigger)}</p>
      </div>
      <span class="cat cat-${r.entry.category === "transactional" ? "tx" : "mk"}">${esc(r.entry.category)}</span>
    </header>
    <dl class="meta">
      <dt>Subject</dt><dd>${esc(r.subject)}</dd>
      <dt>Preheader</dt><dd class="pre">${esc(r.preheader)}</dd>
    </dl>
    <div class="panes">
      <div class="pane">
        <span class="pane-l">Desktop · 600px</span>
        <iframe title="${esc(r.entry.title)} desktop" srcdoc="${esc(r.html)}" class="fr fr-d"></iframe>
      </div>
      <div class="pane">
        <span class="pane-l">Mobile · 375px</span>
        <iframe title="${esc(r.entry.title)} mobile" srcdoc="${esc(r.html)}" class="fr fr-m"></iframe>
      </div>
    </div>
    <details class="txt">
      <summary>Plain-text part</summary>
      <pre>${esc(r.text)}</pre>
    </details>
  </section>`;
}

/**
 * Body-only variant for publishing as a shareable Artifact.
 *
 * The Artifact publisher supplies its own <!doctype>/<html>/<head>/<body>, so
 * emitting them here would nest a second document. Same markup otherwise.
 */
function artifactPage(rendered: Rendered[]): string {
  const full = indexPage(rendered);
  const body = full.slice(full.indexOf("<body>") + "<body>".length, full.lastIndexOf("</body>"));
  const style = full.slice(full.indexOf("<style>"), full.indexOf("</style>") + "</style>".length);
  const title = "Clipiro email redesign — all 41 emails";
  return `<title>${title}</title>\n${style}\n${body}`;
}

function indexPage(rendered: Rendered[]): string {
  const byGroup = new Map<EmailGroup, Rendered[]>();
  for (const r of rendered) {
    const list = byGroup.get(r.entry.group) ?? [];
    list.push(r);
    byGroup.set(r.entry.group, list);
  }

  const nav = GROUP_ORDER.filter((g) => byGroup.has(g))
    .map((g) => `<a href="#g-${g}">${esc(GROUP_LABELS[g])} <b>${byGroup.get(g)!.length}</b></a>`)
    .join("");

  const groups = GROUP_ORDER.filter((g) => byGroup.has(g))
    .map(
      (g) => `
      <h2 id="g-${g}">${esc(GROUP_LABELS[g])}</h2>
      ${byGroup.get(g)!.map(card).join("")}`,
    )
    .join("");

  const emailCount = new Set(rendered.map((r) => r.entry.id)).size;

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Clipiro email redesign — all ${emailCount} emails</title>
<style>
  /* Palette is the product's own (app/globals.css), not an invented one — this
     page is a review surface for Clipiro's brand, so it should wear it.
     Neutrals carry a slight blue bias toward the brand hue rather than being
     flat greys. Tokens are defined once and re-declared per theme, so the
     viewer's theme toggle (which stamps data-theme on :root) wins over the OS
     media query in both directions. */
  :root{
    --bg:#f4f6fb;--card:#fff;--ink:#101828;--soft:#48566d;--faint:#8b99b0;
    --line:#e3e8f2;--brand:${COLOR.brand};--violet:${COLOR.violet};--fuchsia:${COLOR.fuchsia};
    --tx-bg:#eef2ff;--tx-fg:#3730a3;--mk-bg:#eafaf3;--mk-fg:#04624a;
    --warn-bg:#fffaeb;--warn-line:#f5dd9a;--warn-fg:#6b4708;
  }
  @media (prefers-color-scheme:dark){
    :root{
      --bg:#080d18;--card:#101a2e;--ink:#e7eefb;--soft:#a2b1c9;--faint:#6b7c98;
      --line:#1d2942;--tx-bg:#1d1b4b;--tx-fg:#c7d2fe;--mk-bg:#042c22;--mk-fg:#6ee7b7;
      --warn-bg:#241d0e;--warn-line:#4d3d0a;--warn-fg:#f0d391;
    }
  }
  :root[data-theme="dark"]{
    --bg:#080d18;--card:#101a2e;--ink:#e7eefb;--soft:#a2b1c9;--faint:#6b7c98;
    --line:#1d2942;--tx-bg:#1d1b4b;--tx-fg:#c7d2fe;--mk-bg:#042c22;--mk-fg:#6ee7b7;
    --warn-bg:#241d0e;--warn-line:#4d3d0a;--warn-fg:#f0d391;
  }
  :root[data-theme="light"]{
    --bg:#f4f6fb;--card:#fff;--ink:#101828;--soft:#48566d;--faint:#8b99b0;
    --line:#e3e8f2;--tx-bg:#eef2ff;--tx-fg:#3730a3;--mk-bg:#eafaf3;--mk-fg:#04624a;
    --warn-bg:#fffaeb;--warn-line:#f5dd9a;--warn-fg:#6b4708;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font:15px/1.6 'Plus Jakarta Sans','Segoe UI',system-ui,-apple-system,sans-serif}
  .wrap{max-width:1180px;margin:0 auto;padding:0 20px 80px}
  a:focus-visible,summary:focus-visible{outline:2px solid var(--brand);outline-offset:2px;border-radius:6px}

  /* The masthead echoes the emails' own 6px gradient rule rather than filling a
     block with it — the previews below are the thing to look at. */
  .top{border-top:6px solid transparent;
    border-image:linear-gradient(90deg,${COLOR.brand},${COLOR.violet} 55%,${COLOR.fuchsia}) 1;
    margin:0 -20px 30px;padding:30px 20px 0}
  .top h1{margin:0 0 6px;font-size:27px;font-weight:800;letter-spacing:-.02em;text-wrap:balance}
  .top p{margin:0;color:var(--soft);max-width:66ch}
  .count{display:inline-block;font-variant-numeric:tabular-nums;font-weight:800;color:var(--brand)}

  .warn{background:var(--warn-bg);border:1px solid var(--warn-line);color:var(--warn-fg);
    border-radius:12px;padding:13px 17px;margin:20px 0 26px;font-size:14px}
  .warn code{font-size:12.5px;background:rgba(0,0,0,.06);padding:1px 5px;border-radius:4px}

  nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:30px}
  nav a{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:7px 14px;
    color:var(--soft);text-decoration:none;font-size:13px;font-weight:600}
  nav a b{color:var(--brand);font-variant-numeric:tabular-nums}

  h2{font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:var(--faint);
    margin:38px 0 14px;font-weight:800}
  .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:16px}
  .card-h{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:12px}
  .card-h h3{margin:0;font-size:17px;font-weight:800;letter-spacing:-.01em}
  .sample{font-size:12px;font-weight:600;color:var(--brand);background:color-mix(in srgb,var(--brand) 12%,transparent);
    padding:2px 8px;border-radius:999px;vertical-align:middle}
  .trigger{margin:3px 0 0;font-size:13px;color:var(--faint)}
  /* Category is state, so it reads as a chip: whether an email is opt-out-able
     is the single most consequential fact on each card. */
  .cat{font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;white-space:nowrap;
    text-transform:uppercase;letter-spacing:.4px}
  .cat-tx{background:var(--tx-bg);color:var(--tx-fg)}
  .cat-mk{background:var(--mk-bg);color:var(--mk-fg)}

  .meta{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;margin:0 0 14px;font-size:13px}
  .meta dt{color:var(--faint);font-weight:700}
  .meta dd{margin:0;color:var(--soft)}
  .meta .pre{font-style:italic}

  .panes{display:grid;grid-template-columns:1fr 375px;gap:14px}
  @media (max-width:980px){.panes{grid-template-columns:1fr}}
  .pane{display:flex;flex-direction:column;gap:6px;min-width:0}
  .pane-l{font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--faint)}
  .fr{width:100%;border:1px solid var(--line);border-radius:12px;background:#fff;height:620px}
  .fr-m{max-width:375px}

  .txt{margin-top:12px}
  .txt summary{cursor:pointer;font-size:13px;font-weight:700;color:var(--soft)}
  .txt pre{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:14px;
    overflow-x:auto;font-size:12px;line-height:1.5;white-space:pre-wrap}
</style></head><body><div class="wrap">
<header class="top">
  <h1>Clipiro email, redesigned</h1>
  <p>All <span class="count">${emailCount}</span> emails the product can send, rebuilt on one shared layout — table-based and Outlook-safe, responsive, dark-mode aware, and carrying a preheader, a plain-text part and a legal footer on every send.</p>
</header>
<div class="warn">
  <strong>Two placeholders are deliberate.</strong> The footer shows <code>[LEGAL ENTITY NAME]</code> and <code>[REGISTERED ADDRESS]</code> — real values are legally required before any marketing email ships. The logo is a stand-in SVG here; production uses a hosted PNG, because Outlook drops inline SVG.
</div>
<nav>${nav}</nav>
${groups}
</div></body></html>`;
}

async function main(): Promise<void> {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const rendered = renderAll(await logoDataUri());
  for (const r of rendered) {
    writeFileSync(join(OUT_DIR, `${r.slug}.html`), r.html, "utf8");
    writeFileSync(join(OUT_DIR, `${r.slug}.txt`), r.text, "utf8");
  }
  writeFileSync(join(OUT_DIR, "index.html"), indexPage(rendered), "utf8");
  writeFileSync(join(OUT_DIR, "artifact.html"), artifactPage(rendered), "utf8");

  const emails = new Set(rendered.map((r) => r.entry.id)).size;
  process.stdout.write(`Rendered ${emails} emails / ${rendered.length} samples to ${OUT_DIR}\n`);
}

void main();
