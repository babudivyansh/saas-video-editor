// @vitest-environment jsdom
//
// The caption template gallery (CaptionTemplateGallery), as the create page
// uses it through CaptionStyleGrid. testTimeout is raised because jsdom +
// userEvent tests have no headroom against the 5s default under `npm test`.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CAPTION_FAMILIES, CAPTION_TEMPLATES } from "@clipiro/shared/caption-templates";
import CaptionStyleGrid from "./CaptionStyleGrid";
import CaptionTemplateGallery from "@/app/components/captions/CaptionTemplateGallery";
import { resetCaptionTemplateCache } from "@/app/components/captions/useCaptionTemplates";

vi.setConfig({ testTimeout: 30_000 });

/** The server's answer for a free user: Creator and Pro templates locked. */
function apiFor(tier: "free" | "pro") {
  const rank = { free: 0, creator: 1, pro: 2 } as const;
  return {
    tier,
    families: CAPTION_FAMILIES,
    templates: CAPTION_TEMPLATES.map((t) => ({ ...t, locked: rank[t.tier] > rank[tier] })),
  };
}

let api = apiFor("free");

beforeEach(() => {
  resetCaptionTemplateCache();
  api = apiFor("free");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(api), { status: 200, headers: { "Content-Type": "application/json" } })));
});

afterEach(() => vi.unstubAllGlobals());

const card = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}(,|$)`) });

describe("CaptionTemplateGallery", () => {
  it("shows every template by name", async () => {
    render(<CaptionStyleGrid value={null} onChange={() => {}} />);
    expect(await screen.findByRole("button", { name: /^Boardroom/ })).toBeInTheDocument();
    for (const t of CAPTION_TEMPLATES) expect(card(t.name)).toBeInTheDocument();
  });

  it("reports the template id when a free template is picked", async () => {
    const onChange = vi.fn();
    render(<CaptionStyleGrid value={null} onChange={onChange} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Karaoke/ }));
    expect(onChange).toHaveBeenCalledWith("karaoke");
  });

  it("marks templates above the plan and offers the upgrade instead of selecting them", async () => {
    const onChange = vi.fn();
    const onLocked = vi.fn();
    render(<CaptionTemplateGallery value={null} onChange={onChange} onLocked={onLocked} />);
    const hype = await screen.findByRole("button", { name: "Hype Stack, needs Pro" });
    await userEvent.click(hype);
    expect(onChange).not.toHaveBeenCalled();
    expect(onLocked).toHaveBeenCalledWith(expect.objectContaining({ id: "hypestack", tier: "pro" }));
  });

  it("unlocks everything for a Pro user", async () => {
    api = apiFor("pro");
    const onChange = vi.fn();
    render(<CaptionTemplateGallery value={null} onChange={onChange} onLocked={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Hype Stack$/ }));
    expect(onChange).toHaveBeenCalledWith("hypestack");
  });

  it("filters by family", async () => {
    render(<CaptionStyleGrid value={null} onChange={() => {}} />);
    await screen.findByRole("button", { name: /^Boardroom/ });
    await userEvent.click(screen.getByRole("tab", { name: "Hindi & Hinglish" }));
    expect(screen.getByRole("button", { name: /^Dhamaka/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Boardroom/ })).not.toBeInTheDocument();
  });

  it("describes the selected template and says which plan a locked one needs", async () => {
    render(<CaptionStyleGrid value="clean" onChange={() => {}} />);
    await screen.findByRole("button", { name: /^Boardroom/ });
    expect(screen.getByText(/Readable on anything, almost no motion/)).toBeInTheDocument();
    await userEvent.hover(card("Glitch"));
    expect(screen.getByText(/Available on Pro and up/)).toBeInTheDocument();
  });

  it("draws each card as a live preview of the template's own sample line", async () => {
    render(<CaptionStyleGrid value={null} onChange={() => {}} />);
    const boardroom = await screen.findByRole("button", { name: /^Boardroom/ });
    // The rest frame shows the sample's first chunk (three words for Boardroom).
    expect(within(boardroom).getByText("Stop")).toBeInTheDocument();
    expect(within(boardroom).getByText("trading")).toBeInTheDocument();
  });

  it("falls back to the built-in catalogue when the fetch fails, rather than an empty picker", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    render(<CaptionStyleGrid value={null} onChange={() => {}} />);
    expect(await screen.findByRole("button", { name: /^Clean/ })).toBeInTheDocument();
  });
});
