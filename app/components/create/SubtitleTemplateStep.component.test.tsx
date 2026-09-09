// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SubtitleTemplateStep from "./SubtitleTemplateStep";

vi.setConfig({ testTimeout: 30_000 });

const STYLE = {
  fontName: "Impact", fontSize: 92, baseColor: "&H00FFFFFF", highlightColor: "&H004ADE80",
  outlineColor: "&H00000000", outlineWidth: 10, alignment: 5, animated: true,
};

const API = {
  categories: ["Viral", "Creator", "Podcast", "Minimal", "Professional", "More"],
  templates: [
    { id: "clean", label: "Clean", hint: "Neutral white.", category: null, premium: false, emoji: false, lookVerified: true, previewImageUrl: null, previewVideoUrl: null, requiresRender: false, style: STYLE },
    { id: "hormozi", label: "Bold Impact", hint: "Big, loud, all-caps.", category: null, premium: false, emoji: true, lookVerified: true, previewImageUrl: null, previewVideoUrl: null, requiresRender: false, style: STYLE },
  ],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(API), {
    status: 200, headers: { "Content-Type": "application/json" },
  })));
});
afterEach(() => vi.unstubAllGlobals());

function setup(overrides: Partial<React.ComponentProps<typeof SubtitleTemplateStep>> = {}) {
  const onChange = vi.fn();
  const onModeChange = vi.fn();
  render(
    <SubtitleTemplateStep
      value="clean"
      onChange={onChange}
      mode="oneword"
      onModeChange={onModeChange}
      {...overrides}
    />,
  );
  return { onChange, onModeChange };
}

describe("SubtitleTemplateStep", () => {
  it("offers named templates instead of anonymous numbered tiles", async () => {
    setup();
    expect(await screen.findByText("Bold Impact")).toBeInTheDocument();
    expect(screen.getByText("Clean")).toBeInTheDocument();
  });

  it("reports a slug, not an array index", async () => {
    const { onChange } = setup();
    await userEvent.click(await screen.findByRole("button", { name: /Bold Impact/ }));
    expect(onChange).toHaveBeenCalledWith("hormozi");
  });

  it("does NOT reset the selection when the layout toggle flips", async () => {
    // The old per-page pickers called onSelect(0) here, because the two modes
    // indexed two different tables so an index meant different things either
    // side of the switch. A slug means the same thing in both; silently
    // discarding the user's pick was a consequence of the index, not a feature.
    const { onChange, onModeChange } = setup();
    await screen.findByText("Clean");
    await userEvent.click(screen.getByRole("switch"));
    expect(onModeChange).toHaveBeenCalledWith("lines");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("says what each layout actually does", async () => {
    setup();
    expect(await screen.findByText(/One word at a time/i)).toBeInTheDocument();
  });

  it("describes the other layout when it is selected", async () => {
    setup({ mode: "lines" });
    expect(await screen.findByText(/Grouped into short lines/i)).toBeInTheDocument();
  });

  it("takes a per-surface heading, since these pages word it differently", async () => {
    setup({ title: "Select Caption Style" });
    expect(await screen.findByText("Select Caption Style")).toBeInTheDocument();
  });
});
