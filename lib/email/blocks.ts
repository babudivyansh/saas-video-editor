// The block vocabulary every template is written in.
//
// Templates return Block[] rather than HTML strings. Two renderers walk the same
// array — this file to HTML, text.ts to plain text — which is why every email
// gets a text/plain part without anyone writing one.
//
// It is also the escaping boundary. No Block field means "trusted HTML": a field
// typed `string` is ALWAYS escaped here, and the only way to pass through markup
// is a SafeHtml built by the html`` tag. There is deliberately no opt-out.

import { COLOR, FONT_STACK, WIDTH } from "./tokens";
import { escapeHtml, safeUrl, toSafe, type SafeHtml } from "./html";

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "violet";

export type Block =
  | { kind: "heading"; text: string | SafeHtml; level?: 1 | 2 }
  | { kind: "paragraph"; text: string | SafeHtml; tone?: "body" | "muted" | "fine" }
  | { kind: "button"; href: string; label: string; tone?: Tone }
  | { kind: "hero"; label: string; value: string; caption?: string; tone?: Tone }
  | { kind: "kv"; title?: string; rows: Array<{ label: string; value: string | SafeHtml; tone?: Tone; mono?: boolean }> }
  | { kind: "table"; head: string[]; rows: Array<Array<string | SafeHtml>>; align?: Array<"left" | "right"> }
  | { kind: "list"; title?: string; items: Array<string | SafeHtml>; marker?: "bullet" | "check" | "number" }
  | { kind: "callout"; tone: Tone; title?: string; body: string | SafeHtml }
  | { kind: "cards"; cards: Array<{ title: string; subtitle: string; tone?: Tone }> }
  | { kind: "pin"; code: string }
  | { kind: "divider" }
  | { kind: "spacer"; size?: "sm" | "md" | "lg" }
  | { kind: "pixel"; src: string };

const TONE_COLORS: Record<Tone, { fg: string; bg: string; border: string }> = {
  neutral: { fg: COLOR.ink, bg: COLOR.surface, border: COLOR.border },
  brand: { fg: COLOR.brand, bg: COLOR.brandSoft, border: "#c7d3ff" },
  success: { fg: COLOR.success, bg: COLOR.successSoft, border: COLOR.successBorder },
  warning: { fg: COLOR.warning, bg: COLOR.warningSoft, border: COLOR.warningBorder },
  danger: { fg: COLOR.danger, bg: COLOR.dangerSoft, border: COLOR.dangerBorder },
  violet: { fg: COLOR.violet, bg: COLOR.violetSoft, border: COLOR.violetBorder },
};

const BASE_TEXT = `font-family:${FONT_STACK};margin:0;`;

/** Wrap block content in the full-width row every block sits in. */
function row(inner: string, paddingY = "0"): string {
  return `<tr><td style="padding:${paddingY} 32px;" class="px">${inner}</td></tr>`;
}

function renderHeading(b: Extract<Block, { kind: "heading" }>): string {
  const content = toSafe(b.text).html;
  const isH1 = (b.level ?? 1) === 1;
  const size = isH1 ? 26 : 19;
  const cls = isH1 ? "h1" : "h2";
  return row(
    `<h${isH1 ? 1 : 2} class="${cls}" style="${BASE_TEXT}font-size:${size}px;line-height:1.3;font-weight:800;color:${COLOR.ink};padding:0 0 10px;">${content}</h${isH1 ? 1 : 2}>`,
  );
}

function renderParagraph(b: Extract<Block, { kind: "paragraph" }>): string {
  const tone = b.tone ?? "body";
  const color = tone === "fine" ? COLOR.faint : tone === "muted" ? COLOR.muted : COLOR.inkSoft;
  const size = tone === "fine" ? 13 : 15;
  const cls = tone === "fine" ? "t-fine" : "t-soft";
  return row(
    `<p class="${cls}" style="${BASE_TEXT}font-size:${size}px;line-height:1.65;color:${color};padding:0 0 16px;">${toSafe(b.text).html}</p>`,
  );
}

/**
 * Bulletproof CTA.
 *
 * The VML block is what makes the pill render in Outlook's Word engine, which
 * ignores border-radius and padding on an anchor; arcsize="50%" reproduces the
 * border-radius:999px the old buttons used. Everything else gets the anchor,
 * with the brand gradient layered over a solid fallback — Apple Mail honours the
 * gradient, Gmail and Outlook fall back to solid #335cff rather than to nothing.
 */
function renderButton(b: Extract<Block, { kind: "button" }>): string {
  const href = safeUrl(b.href);
  const label = escapeHtml(b.label);
  const bg = b.tone && b.tone !== "brand" ? TONE_COLORS[b.tone].fg : COLOR.brand;
  const gradient =
    !b.tone || b.tone === "brand"
      ? `background-image:linear-gradient(135deg,${COLOR.brand} 0%,${COLOR.violet} 55%,${COLOR.fuchsia} 100%);`
      : "";

  return row(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;"><tr><td>
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
        href="${href}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="50%" stroke="f" fillcolor="${bg}">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:${FONT_STACK};font-size:15px;font-weight:700;">${label}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${href}" style="display:inline-block;background-color:${bg};${gradient}color:#ffffff;text-decoration:none;font-family:${FONT_STACK};font-size:15px;font-weight:700;line-height:1;padding:16px 34px;border-radius:999px;mso-hide:all;">${label}</a>
      <!--<![endif]-->
    </td></tr></table>`,
  );
}

function renderHero(b: Extract<Block, { kind: "hero" }>): string {
  const t = TONE_COLORS[b.tone ?? "brand"];
  return row(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="panel" style="background-color:${t.bg};border:1px solid ${t.border};border-radius:16px;margin:0 0 20px;">
      <tr><td align="center" style="padding:28px 24px;">
        <p style="${BASE_TEXT}font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${t.fg};padding:0 0 6px;">${escapeHtml(b.label)}</p>
        <p style="${BASE_TEXT}font-size:44px;line-height:1.1;font-weight:800;color:${t.fg};padding:0;">${escapeHtml(b.value)}</p>
        ${b.caption ? `<p style="${BASE_TEXT}font-size:14px;color:${t.fg};opacity:0.85;padding:8px 0 0;">${escapeHtml(b.caption)}</p>` : ""}
      </td></tr>
    </table>`,
  );
}

function renderKv(b: Extract<Block, { kind: "kv" }>): string {
  const rows = b.rows
    .map((r) => {
      const valueColor = r.tone ? TONE_COLORS[r.tone].fg : COLOR.ink;
      const mono = r.mono ? "font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;" : "font-size:14px;";
      return `<tr>
        <td style="${BASE_TEXT}font-size:14px;color:${COLOR.muted};padding:7px 0;">${escapeHtml(r.label)}</td>
        <td align="right" style="${BASE_TEXT}${mono}font-weight:600;color:${valueColor};padding:7px 0;text-align:right;">${toSafe(r.value).html}</td>
      </tr>`;
    })
    .join("");

  return row(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="panel" style="background-color:${COLOR.surface};border:1px solid ${COLOR.border};border-radius:16px;margin:0 0 20px;">
      <tr><td style="padding:20px 24px;">
        ${b.title ? `<p style="${BASE_TEXT}font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COLOR.faint};padding:0 0 10px;">${escapeHtml(b.title)}</p>` : ""}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>
      </td></tr>
    </table>`,
  );
}

function renderTable(b: Extract<Block, { kind: "table" }>): string {
  const alignOf = (i: number) => b.align?.[i] ?? "left";
  const head = b.head
    .map(
      (h, i) =>
        `<th align="${alignOf(i)}" style="${BASE_TEXT}font-size:12px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${COLOR.faint};padding:0 0 10px;text-align:${alignOf(i)};">${escapeHtml(h)}</th>`,
    )
    .join("");
  const body = b.rows
    .map(
      (r) =>
        `<tr>${r
          .map(
            (cell, i) =>
              `<td align="${alignOf(i)}" style="${BASE_TEXT}font-size:14px;color:${COLOR.ink};padding:10px 0;border-top:1px solid ${COLOR.borderSoft};text-align:${alignOf(i)};">${toSafe(cell).html}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");

  return row(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">
      <tr>${head}</tr>${body}
    </table>`,
  );
}

/**
 * Lists as a table, not <ul>/<li>.
 *
 * The old templates used real lists, which pick up wildly different default
 * indentation per client. A presentation table with an explicit marker cell
 * renders identically everywhere.
 */
function renderList(b: Extract<Block, { kind: "list" }>): string {
  const marker = b.marker ?? "bullet";
  const items = b.items
    .map((item, i) => {
      const bullet =
        marker === "check"
          ? `<span style="color:${COLOR.success};font-weight:700;">&#10003;</span>`
          : marker === "number"
            ? `<span style="color:${COLOR.brand};font-weight:700;">${i + 1}.</span>`
            : `<span style="color:${COLOR.brand};font-weight:700;">&bull;</span>`;
      return `<tr>
        <td valign="top" width="24" style="${BASE_TEXT}font-size:15px;line-height:1.6;padding:5px 0;width:24px;">${bullet}</td>
        <td valign="top" style="${BASE_TEXT}font-size:15px;line-height:1.6;color:${COLOR.inkSoft};padding:5px 0;">${toSafe(item).html}</td>
      </tr>`;
    })
    .join("");

  return row(
    `${b.title ? `<p style="${BASE_TEXT}font-size:14px;font-weight:700;color:${COLOR.ink};padding:0 0 8px;">${escapeHtml(b.title)}</p>` : ""}
     <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">${items}</table>`,
  );
}

function renderCallout(b: Extract<Block, { kind: "callout" }>): string {
  const t = TONE_COLORS[b.tone];
  return row(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="panel" style="background-color:${t.bg};border:1px solid ${t.border};border-left:4px solid ${t.fg};border-radius:12px;margin:0 0 20px;">
      <tr><td style="padding:16px 20px;">
        ${b.title ? `<p style="${BASE_TEXT}font-size:14px;font-weight:700;color:${t.fg};padding:0 0 4px;">${escapeHtml(b.title)}</p>` : ""}
        <p style="${BASE_TEXT}font-size:14px;line-height:1.6;color:${COLOR.inkSoft};padding:0;">${toSafe(b.body).html}</p>
      </td></tr>
    </table>`,
  );
}

/** Side-by-side cards that stack on mobile via the .stack class in layout.ts. */
function renderCards(b: Extract<Block, { kind: "cards" }>): string {
  const cells = b.cards
    .map((c) => {
      const t = TONE_COLORS[c.tone ?? "neutral"];
      return `<td class="stack" width="50%" valign="top" style="width:50%;padding:0 6px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="panel" style="background-color:${t.bg};border:1px solid ${t.border};border-radius:14px;">
          <tr><td style="padding:18px;">
            <p style="${BASE_TEXT}font-size:16px;font-weight:800;color:${t.fg};padding:0 0 4px;">${escapeHtml(c.title)}</p>
            <p style="${BASE_TEXT}font-size:13px;line-height:1.55;color:${COLOR.inkSoft};padding:0;">${escapeHtml(c.subtitle)}</p>
          </td></tr>
        </table>
      </td>`;
    })
    .join("");

  return row(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;"><tr>${cells}</tr></table>`,
  );
}

function renderPin(b: Extract<Block, { kind: "pin" }>): string {
  return row(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="panel" style="background-color:${COLOR.surface};border:1px solid ${COLOR.border};border-radius:16px;margin:0 0 20px;">
      <tr><td align="center" style="padding:26px 20px;">
        <span class="pin" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:38px;font-weight:800;letter-spacing:12px;color:${COLOR.ink};">${escapeHtml(b.code)}</span>
      </td></tr>
    </table>`,
  );
}

function renderDivider(): string {
  return row(`<div style="border-top:1px solid ${COLOR.borderSoft};font-size:0;line-height:0;margin:4px 0 20px;">&nbsp;</div>`);
}

function renderSpacer(b: Extract<Block, { kind: "spacer" }>): string {
  const h = b.size === "lg" ? 32 : b.size === "sm" ? 8 : 18;
  return `<tr><td style="height:${h}px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
}

function renderPixel(b: Extract<Block, { kind: "pixel" }>): string {
  return `<tr><td style="font-size:0;line-height:0;"><img src="${safeUrl(b.src)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;"/></td></tr>`;
}

/** Render one block to its table row(s). */
export function renderBlock(block: Block): string {
  switch (block.kind) {
    case "heading":
      return renderHeading(block);
    case "paragraph":
      return renderParagraph(block);
    case "button":
      return renderButton(block);
    case "hero":
      return renderHero(block);
    case "kv":
      return renderKv(block);
    case "table":
      return renderTable(block);
    case "list":
      return renderList(block);
    case "callout":
      return renderCallout(block);
    case "cards":
      return renderCards(block);
    case "pin":
      return renderPin(block);
    case "divider":
      return renderDivider();
    case "spacer":
      return renderSpacer(block);
    case "pixel":
      return renderPixel(block);
  }
}

export function renderBlocks(blocks: Block[]): string {
  return blocks.map(renderBlock).join("\n");
}

export { WIDTH };
