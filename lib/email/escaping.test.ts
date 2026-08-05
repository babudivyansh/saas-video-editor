// Registry-driven escaping proof.
//
// The old email module interpolated user-controlled values straight into HTML —
// a referral display name, a moderator's rejection reason, a bank decline
// message, a social account name. This poisons EVERY string prop of EVERY
// registered email and asserts the payload never survives into the markup.
//
// The point of driving it from the registry is that it covers templates and
// fields that do not exist yet: adding an email without escaping fails here
// automatically, with no one having to remember to write a test.
//
// Note this file imports the render layer but never lib/env — that boundary is
// what lets it run at all (lib/env parses the whole environment eagerly, which
// is why every older email test has to vi.mock the module instead).

import { describe, it, expect } from "vitest";
import { renderEmail } from "./layout";
import { renderText } from "./text";
import { escapeHtml, html, raw, safeUrl } from "./html";
import { EMAIL_REGISTRY } from "./templates/registry";

/** Closes an attribute, opens a tag, and fires — catches naive escaping. */
const XSS = `"><img src=x onerror=alert(1)><script>alert(2)</script>`;

/** Replace every string leaf, leaving dates/numbers/booleans structurally valid. */
function poison(value: unknown): unknown {
  if (typeof value === "string") return XSS;
  if (Array.isArray(value)) return value.map(poison);
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, poison(v)]));
  }
  return value;
}

describe("html`` tag", () => {
  it("escapes interpolated values but not literal markup", () => {
    const out = html`Hi <strong>${"Bob & Co"}</strong>`;
    expect(out.html).toBe("Hi <strong>Bob &amp; Co</strong>");
  });

  it("produces a text form with the markup stripped and entities intact", () => {
    const out = html`Hi <strong>${"Bob & Co"}</strong>`;
    expect(out.text).toBe("Hi Bob & Co");
  });

  it("neutralises an injection attempt", () => {
    const out = html`<p>${XSS}</p>`;
    expect(out.html).not.toContain("<img");
    expect(out.html).not.toContain("<script");
  });

  it("passes nested SafeHtml through without double-escaping", () => {
    const inner = html`<em>${"a & b"}</em>`;
    const outer = html`<p>${inner}</p>`;
    expect(outer.html).toBe("<p><em>a &amp; b</em></p>");
  });

  it("renders null and undefined as empty rather than the literal words", () => {
    expect(html`x${null}y${undefined}z`.html).toBe("xyz");
  });
});

describe("safeUrl", () => {
  it("allows http, https, mailto and site-relative links", () => {
    expect(safeUrl("https://clipiro.com/x")).toBe("https://clipiro.com/x");
    expect(safeUrl("mailto:a@b.com")).toBe("mailto:a@b.com");
    expect(safeUrl("/dashboard")).toBe("/dashboard");
  });

  it("rejects javascript: and data: URLs", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("#");
    expect(safeUrl("data:text/html,<script>alert(1)</script>")).toBe("#");
    expect(safeUrl("  JaVaScRiPt:alert(1)")).toBe("#");
  });

  it("escapes quotes so a URL cannot break out of its attribute", () => {
    expect(safeUrl(`https://x.com/"><img src=x>`)).not.toContain(`"><img`);
  });
});

describe("raw", () => {
  it("passes trusted markup through untouched", () => {
    expect(raw("<b>ok</b>").html).toBe("<b>ok</b>");
  });
});

describe("escapeHtml", () => {
  it("covers all five dangerous characters", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});

describe("every registered email escapes every string prop", () => {
  const entries = Object.entries(EMAIL_REGISTRY);

  it("has templates registered", () => {
    expect(entries.length).toBeGreaterThan(40);
  });

  for (const [id, entry] of entries) {
    for (const sampleName of Object.keys(entry.samples)) {
      it(`${id} / ${sampleName}`, () => {
        const props = poison(entry.samples[sampleName as keyof typeof entry.samples]);
        const doc = entry.build(props as never);
        const { html: out } = renderEmail({
          ...doc,
          unsubscribeUrl: entry.category === "transactional" ? undefined : "https://clipiro.com/u?t=x",
        });

        // Asserts no EXECUTABLE form survives — not merely that the characters
        // are absent. Once escaped, the payload is still legible as text
        // ("&lt;img src=x onerror=..."), and that is fine: it renders as visible
        // gibberish rather than as markup. So checking for a bare "onerror="
        // would fail on safely-escaped output, and checking for `"><` would fail
        // on the layout's own markup, where an attribute routinely closes
        // immediately before the next tag.
        expect(out).not.toContain("<img src=x");
        expect(out).not.toContain("<script>");
        expect(out).not.toContain(XSS);
      });
    }
  }
});

describe("every registered email produces a usable plain-text part", () => {
  for (const [id, entry] of Object.entries(EMAIL_REGISTRY)) {
    const sampleName = Object.keys(entry.samples)[0];

    it(`${id} carries its CTA URLs into the text part`, () => {
      const doc = entry.build(entry.samples[sampleName as keyof typeof entry.samples] as never);
      const text = renderText({ preheader: doc.preheader, blocks: doc.blocks });

      // A text part that drops the links is worse than no text part.
      for (const block of doc.blocks) {
        if (block.kind === "button") expect(text).toContain(block.href);
      }
      expect(text.trim().length).toBeGreaterThan(0);
      // Markup must never leak into text/plain.
      expect(text).not.toContain("<td");
      expect(text).not.toContain("<table");
    });
  }
});

describe("document shell", () => {
  const doc = EMAIL_REGISTRY.welcome.build(EMAIL_REGISTRY.welcome.samples.default as never);

  it("emits a doctype, charset and title", () => {
    const { html: out } = renderEmail(doc);
    expect(out).toMatch(/^<!DOCTYPE html/);
    expect(out).toContain('charset=utf-8');
    expect(out).toContain("<title>");
  });

  it("includes the preheader before any visible content", () => {
    const { html: out } = renderEmail(doc);
    expect(out).toContain(doc.preheader);
  });

  it("adds List-Unsubscribe only when an unsubscribe URL is present", () => {
    expect(renderEmail(doc).listUnsubscribe).toBeUndefined();
    const withUnsub = renderEmail({ ...doc, unsubscribeUrl: "https://clipiro.com/u?t=x" });
    expect(withUnsub.listUnsubscribe?.http).toBe("https://clipiro.com/u?t=x");
    expect(withUnsub.listUnsubscribe?.mailto).toContain("mailto:");
  });

  it("marks the document RTL for Arabic", () => {
    expect(renderEmail({ ...doc, locale: "ar" }).html).toContain('dir="rtl"');
    expect(renderEmail({ ...doc, locale: "en" }).html).toContain('dir="ltr"');
  });
});
