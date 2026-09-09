// @vitest-environment jsdom
//
// testTimeout is raised for the whole file for the same reason as
// CaptionTemplatePicker.component.test.tsx: jsdom + userEvent tests dispatch
// dozens of real events and have no headroom against vitest's 5s default once
// `npm test` runs many files in parallel.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CaptionStyleGrid from "./CaptionStyleGrid";

vi.setConfig({ testTimeout: 30_000 });

const STYLE = {
  fontName: "Impact", fontSize: 92, baseColor: "&H00FFFFFF", highlightColor: "&H004ADE80",
  outlineColor: "&H00000000", outlineWidth: 10, alignment: 5, animated: true,
};

const API_TEMPLATES = {
  categories: ["Viral", "Creator", "Podcast", "Minimal", "Professional", "More"],
  templates: [
    { id: "clean", label: "Clean", hint: "Neutral white.", category: null, premium: false, emoji: false, lookVerified: true, previewImageUrl: null, previewVideoUrl: null, requiresRender: false, style: STYLE },
    { id: "viral-bold-01", label: "Hormozi 1", hint: "Heavy all-caps with a green pop.", category: "Viral", premium: true, emoji: true, lookVerified: true, previewImageUrl: null, previewVideoUrl: null, requiresRender: true, style: STYLE },
    { id: "creator-modern", label: "Ali", hint: "Clean sans with a soft highlight.", category: "Creator", premium: true, emoji: false, lookVerified: true, previewImageUrl: null, previewVideoUrl: null, requiresRender: true, style: STYLE },
    { id: "jess", label: "Jess", hint: "Partner style — the swatch is a stand-in, not the real look.", category: "More", premium: true, emoji: false, lookVerified: false, previewImageUrl: null, previewVideoUrl: null, requiresRender: true, style: STYLE },
  ],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(API_TEMPLATES), {
    status: 200, headers: { "Content-Type": "application/json" },
  })));
});

afterEach(() => vi.unstubAllGlobals());

describe("CaptionStyleGrid", () => {
  it("names every swatch, so 18 looks aren't told apart by one sample word", async () => {
    render(<CaptionStyleGrid value={null} onChange={() => {}} />);
    expect(await screen.findByText("Hormozi 1")).toBeInTheDocument();
    expect(screen.getByText("Ali")).toBeInTheDocument();
    expect(screen.getByText("Clean")).toBeInTheDocument();
  });

  it("shows the description and the price warning on hover, not before", async () => {
    render(<CaptionStyleGrid value={null} onChange={() => {}} />);
    const swatch = await screen.findByRole("button", { name: /Hormozi 1/ });

    expect(screen.queryByText(/Heavy all-caps with a green pop/)).not.toBeInTheDocument();

    await userEvent.hover(swatch);
    expect(await screen.findByText(/Heavy all-caps with a green pop/)).toBeInTheDocument();
    // The one fact worth surfacing before the click: this style bills.
    expect(screen.getByText(/costs credits per minute/i)).toBeInTheDocument();

    await userEvent.unhover(swatch);
    expect(screen.queryByText(/Heavy all-caps with a green pop/)).not.toBeInTheDocument();
  });

  it("says the premium preview is an approximation, because it is", async () => {
    // Without recorded media the hover card animates the NATIVE style, which is
    // not what the user is paying for. Claiming otherwise would misrepresent a
    // paid render.
    render(<CaptionStyleGrid value={null} onChange={() => {}} />);
    await userEvent.hover(await screen.findByRole("button", { name: /Hormozi 1/ }));
    expect(await screen.findByText(/approximates it/i)).toBeInTheDocument();
  });

  it("makes no such claim for a free style, which renders exactly as previewed", async () => {
    render(<CaptionStyleGrid value={null} onChange={() => {}} />);
    await userEvent.hover(await screen.findByRole("button", { name: /Clean/ }));
    expect(await screen.findByText(/Neutral white/)).toBeInTheDocument();
    expect(screen.queryByText(/approximates it/i)).not.toBeInTheDocument();
  });

  it("reports the template slug, never the label the provider shares", async () => {
    const onChange = vi.fn();
    render(<CaptionStyleGrid value={null} onChange={onChange} />);
    await userEvent.click(await screen.findByRole("button", { name: /Hormozi 1/ }));
    expect(onChange).toHaveBeenCalledWith("viral-bold-01");
  });

  it("marks which templates auto-place emoji, and only those", async () => {
    render(<CaptionStyleGrid value={null} onChange={() => {}} />);
    await screen.findByText("Hormozi 1");
    const marks = screen.getAllByLabelText("Auto-places emoji");
    expect(marks).toHaveLength(1);
    expect(marks[0].closest("button")).toHaveTextContent("Hormozi 1");
  });

  it("draws the emoji the renderer would place, on the word it would place it on", async () => {
    // planEmoji() maps "insane" -> 🔥 and the ASS builder appends it to that
    // word. If the preview invented its own placement the two would drift, and
    // the card would be selling a look the render doesn't produce.
    render(<CaptionStyleGrid value={null} onChange={() => {}} />);
    await userEvent.hover(await screen.findByRole("button", { name: /Hormozi 1/ }));
    expect(await screen.findByText("INSANE 🔥")).toBeInTheDocument();
  });

  it("keeps emoji out of a template that doesn't ask for them", async () => {
    render(<CaptionStyleGrid value={null} onChange={() => {}} />);
    await userEvent.hover(await screen.findByRole("button", { name: /Ali/ }));
    expect(await screen.findByText("INSANE")).toBeInTheDocument();
    expect(screen.queryByText("INSANE 🔥")).not.toBeInTheDocument();
  });

  it("does not promise our emoji survive to a paid provider render", async () => {
    // The provider's API has no emoji parameter at all, so on a paid render the
    // emoji are its template's, not ours. Saying otherwise would be a promise
    // the integration cannot keep.
    render(<CaptionStyleGrid value={null} onChange={() => {}} />);
    await userEvent.hover(await screen.findByRole("button", { name: /Hormozi 1/ }));
    expect(await screen.findByText(/fallback render/i)).toBeInTheDocument();
  });

  it("filters by category", async () => {
    render(<CaptionStyleGrid value={null} onChange={() => {}} />);
    await userEvent.click(await screen.findByRole("tab", { name: "Creator" }));
    expect(screen.getByText("Ali")).toBeInTheDocument();
    expect(screen.queryByText("Hormozi 1")).not.toBeInTheDocument();
  });

  it("offers the rest of the provider's library under its own tab", async () => {
    render(<CaptionStyleGrid value={null} onChange={() => {}} />);
    await userEvent.click(await screen.findByRole("tab", { name: "More" }));
    expect(screen.getByText("Jess")).toBeInTheDocument();
    expect(screen.queryByText("Hormozi 1")).not.toBeInTheDocument();
  });

  it("says outright that an unauthored swatch is a stand-in", async () => {
    // 33 of these ship with a look nobody has seen. Presenting one as the real
    // thing would misprice the user's expectations of a paid render AND of the
    // fallback, which is what actually burns in when the provider is down.
    render(<CaptionStyleGrid value={null} onChange={() => {}} />);
    await userEvent.hover(await screen.findByRole("button", { name: /Jess/ }));
    expect(await screen.findByText(/stand-in look/i)).toBeInTheDocument();
  });

  it("does not call an authored look a stand-in", async () => {
    render(<CaptionStyleGrid value={null} onChange={() => {}} />);
    await userEvent.hover(await screen.findByRole("button", { name: /Hormozi 1/ }));
    await screen.findByText(/Heavy all-caps/);
    expect(screen.queryByText(/stand-in look/i)).not.toBeInTheDocument();
  });
});
