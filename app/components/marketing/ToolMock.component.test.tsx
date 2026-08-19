import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ALL_TOOLS } from "@/app/components/featureLinks";
import ToolMock from "./ToolMock";
import { getMotif, hasSecondaryMotif, motifLabel } from "./toolMotifs";

describe("ToolMock", () => {
  it("resolves a motif for every tool", () => {
    const blank = ALL_TOOLS.filter((tool) => !getMotif(tool.slug)).map((tool) => tool.slug);
    expect(blank).toEqual([]);
  });

  it("gives every tool a labelled illustration", () => {
    for (const tool of ALL_TOOLS) {
      const html = renderToStaticMarkup(<ToolMock slug={tool.slug} label={tool.title} />);
      expect(html, `${tool.slug} role`).toContain('role="img"');
      expect(html, `${tool.slug} label`).toMatch(/aria-label="[^"]{20,}"/);
    }
  });

  it("never renders text inside the artwork", () => {
    // A <text> node under role="img" is redundant with the aria-label at best.
    // dashboard/toolPreviews.tsx shows the failure mode this guards against —
    // decorative fake UI copy read aloud as if it were page content.
    for (const tool of ALL_TOOLS) {
      for (const variant of ["primary", "secondary"] as const) {
        if (variant === "secondary" && !hasSecondaryMotif(tool.slug)) continue;
        const html = renderToStaticMarkup(<ToolMock slug={tool.slug} label={tool.title} variant={variant} />);
        expect(html, `${tool.slug} ${variant}`).not.toContain("<text");
      }
    }
  });

  it("gives each gradient a unique id so two mocks on a page cannot collide", () => {
    const pair = ALL_TOOLS.filter((t) => hasSecondaryMotif(t.slug))[0];
    const html =
      renderToStaticMarkup(<ToolMock slug={pair.slug} label={pair.title} />) +
      renderToStaticMarkup(<ToolMock slug={pair.slug} label={pair.title} variant="secondary" />);
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("labels the second illustration differently from the first", () => {
    for (const tool of ALL_TOOLS.filter((t) => hasSecondaryMotif(t.slug))) {
      expect(motifLabel(tool.slug, "secondary", tool.title), tool.slug).not.toBe(
        motifLabel(tool.slug, "primary", tool.title),
      );
    }
  });
});
