// The plain-text part, rendered from the same Block[] as the HTML.
//
// Every email previously went out HTML-only, which costs deliverability and
// leaves plain-text clients with nothing. Because templates return blocks rather
// than markup, this is a second walk over the same data — the two parts cannot
// drift, and no html-to-text dependency is involved.

import type { Block } from "./blocks";
import { LEGAL, PRODUCT_NAME } from "./tokens";
import { toSafe } from "./html";

const WRAP_AT = 72;

/** Greedy wrap. Long unbroken tokens (URLs) are left intact rather than split. */
function wrap(text: string, width = WRAP_AT): string {
  return text
    .split("\n")
    .map((line) => {
      if (line.length <= width) return line;
      const words = line.split(" ");
      const out: string[] = [];
      let current = "";
      for (const word of words) {
        if (current === "") current = word;
        else if (`${current} ${word}`.length <= width) current += ` ${word}`;
        else {
          out.push(current);
          current = word;
        }
      }
      if (current) out.push(current);
      return out.join("\n");
    })
    .join("\n");
}

function blockToText(block: Block): string | null {
  switch (block.kind) {
    case "heading": {
      const text = toSafe(block.text).text.trim();
      const rule = (block.level ?? 1) === 1 ? "=" : "-";
      return `${text}\n${rule.repeat(Math.min(text.length, WRAP_AT))}`;
    }
    case "paragraph":
      return wrap(toSafe(block.text).text.trim());

    // The URL must survive into the text part — that is the whole point of it.
    case "button":
      return `${block.label}: ${block.href}`;

    case "hero":
      return [block.label.toUpperCase(), `  ${block.value}`, block.caption ? `  ${block.caption}` : null]
        .filter(Boolean)
        .join("\n");

    case "kv": {
      const rows = block.rows.map((r) => `  ${r.label}: ${toSafe(r.value).text}`);
      return [block.title ? `${block.title.toUpperCase()}` : null, ...rows].filter(Boolean).join("\n");
    }

    case "table": {
      const widths = block.head.map((h, i) =>
        Math.max(h.length, ...block.rows.map((r) => toSafe(r[i] ?? "").text.length)),
      );
      const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();
      return [
        line(block.head),
        widths.map((w) => "-".repeat(w)).join("  "),
        ...block.rows.map((r) => line(r.map((c) => toSafe(c).text))),
      ].join("\n");
    }

    case "list": {
      const items = block.items.map((item, i) => {
        const marker = block.marker === "check" ? "[x]" : block.marker === "number" ? `${i + 1}.` : "-";
        return `  ${marker} ${toSafe(item).text}`;
      });
      return [block.title ?? null, ...items].filter(Boolean).join("\n");
    }

    case "callout":
      return [block.title ? `! ${block.title}` : "!", `  ${wrap(toSafe(block.body).text.trim())}`]
        .filter(Boolean)
        .join("\n");

    case "cards":
      return block.cards.map((c) => `  ${c.title} — ${c.subtitle}`).join("\n");

    case "pin":
      return `  Your code: ${block.code}`;

    case "divider":
      return "-".repeat(WRAP_AT);

    case "spacer":
      return "";

    // Tracking pixels and other HTML-only artefacts have no text form.
    case "pixel":
      return null;
  }
}

export interface TextRenderInput {
  preheader: string;
  blocks: Block[];
  unsubscribeUrl?: string;
}

export function renderText(input: TextRenderInput): string {
  const body = input.blocks
    .map(blockToText)
    .filter((s): s is string => s !== null)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const footer = [
    "-".repeat(WRAP_AT),
    `${PRODUCT_NAME} — ${LEGAL.entity}`,
    LEGAL.address,
    `Support: ${LEGAL.supportEmail}`,
    input.unsubscribeUrl ? `Unsubscribe: ${input.unsubscribeUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `${input.preheader}\n\n${body}\n\n${footer}\n`;
}
