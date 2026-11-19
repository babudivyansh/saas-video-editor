// @vitest-environment jsdom
//
// A clip's Captions panel: the template picker and the three tweaks.
// testTimeout is raised because jsdom + userEvent tests have no headroom
// against vitest's 5s default once `npm test` runs many files in parallel.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CAPTION_FAMILIES, CAPTION_TEMPLATES } from "@clipiro/shared/caption-templates";
import { CaptionTemplatePicker, CaptionTweakControls, quickPickTemplates } from "./CaptionTemplatePicker";
import { resetCaptionTemplateCache } from "@/app/components/captions/useCaptionTemplates";

vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  resetCaptionTemplateCache();
  const body = { tier: "pro", families: CAPTION_FAMILIES, templates: CAPTION_TEMPLATES.map((t) => ({ ...t, locked: false })) };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })));
});

afterEach(() => vi.unstubAllGlobals());

describe("CaptionTemplatePicker", () => {
  it("shows four styles, the clip's own first, and the rest behind All styles", async () => {
    render(<CaptionTemplatePicker value="twomic" onChange={() => {}} />);
    const pressed = await screen.findAllByRole("button", { pressed: true });
    expect(pressed.map((b) => b.getAttribute("aria-label"))).toEqual(["Two Mic"]);
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(3);
    expect(screen.getByRole("button", { name: `All ${CAPTION_TEMPLATES.length} caption styles` })).toBeInTheDocument();
  });

  it("picks from the full gallery in its own dialog, then closes it", async () => {
    const onChange = vi.fn();
    render(<CaptionTemplatePicker value="clean" onChange={onChange} />);
    await userEvent.click(await screen.findByRole("button", { name: /^All \d+ caption styles$/ }));
    const dialog = await screen.findByRole("dialog", { name: "Caption styles" });
    await userEvent.click(within(dialog).getByRole("button", { name: /^Two Mic$/ }));
    expect(onChange).toHaveBeenCalledWith("twomic");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Caption styles" })).not.toBeInTheDocument());
  });

  it("quickPickTemplates skips locked styles and never repeats the current one", () => {
    const list = CAPTION_TEMPLATES.slice(0, 6).map((t, i) => ({ ...t, locked: i === 1 }));
    expect(quickPickTemplates(list, list[3].id).map((t) => t.id)).toEqual([list[3].id, list[0].id, list[2].id, list[4].id]);
    expect(quickPickTemplates(list, null).map((t) => t.id)).toEqual([list[0].id, list[2].id, list[3].id, list[4].id]);
  });

  it("applies the server's renames (admin overrides)", async () => {
    resetCaptionTemplateCache();
    const body = {
      tier: "pro",
      families: CAPTION_FAMILIES,
      templates: CAPTION_TEMPLATES.map((t) => ({ ...t, name: t.id === "clean" ? "Plain Jane" : t.name, locked: false })),
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })));
    render(<CaptionTemplatePicker value="clean" onChange={() => {}} />);
    expect(await screen.findByRole("button", { name: /^Plain Jane$/ })).toBeInTheDocument();
  });
});

describe("CaptionTweakControls", () => {
  const base = {
    accent: null,
    templateAccent: "#B8FF3B",
    onAccentChange: vi.fn(),
    sizeScale: 1,
    onSizeScaleChange: vi.fn(),
    positionY: 50,
    onPositionYChange: vi.fn(),
  };

  it("shows the template's accent until the user picks their own, and can reset it", async () => {
    const onAccentChange = vi.fn();
    const { rerender } = render(<CaptionTweakControls {...base} onAccentChange={onAccentChange} />);
    expect((screen.getByLabelText("Accent colour") as HTMLInputElement).value.toLowerCase()).toBe("#b8ff3b");
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
    rerender(<CaptionTweakControls {...base} accent="#FF0000" onAccentChange={onAccentChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onAccentChange).toHaveBeenCalledWith(null);
  });

  it("reports size as a multiplier and position as a percentage", () => {
    const onSizeScaleChange = vi.fn();
    const onPositionYChange = vi.fn();
    render(<CaptionTweakControls {...base} onSizeScaleChange={onSizeScaleChange} onPositionYChange={onPositionYChange} />);
    fireEvent.change(screen.getByLabelText("Size"), { target: { value: "120" } });
    expect(onSizeScaleChange).toHaveBeenCalledWith(1.2);
    fireEvent.change(screen.getByLabelText("Position"), { target: { value: "30" } });
    expect(onPositionYChange).toHaveBeenCalledWith(30);
  });

  it("keeps captions out of the bottom area platforms cover", () => {
    render(<CaptionTweakControls {...base} />);
    expect(screen.getByLabelText("Position")).toHaveAttribute("max", "80");
  });

  it("copies the style to the other clips in ONE click, and says it renders nothing", async () => {
    const onApplyToAll = vi.fn();
    const { rerender } = render(<CaptionTweakControls {...base} otherClipCount={4} onApplyToAll={onApplyToAll} />);
    expect(screen.getByText(/without re-rendering, so it costs nothing now/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Use this style on the other 4 clips" }));
    expect(onApplyToAll).toHaveBeenCalledTimes(1);
    rerender(<CaptionTweakControls {...base} otherClipCount={4} onApplyToAll={onApplyToAll} applyToAllState="done" />);
    expect(screen.getByRole("button", { name: /Style copied to 4 other clips/ })).toBeInTheDocument();
  });

  it("hides apply-to-all for a clip with no siblings", () => {
    render(<CaptionTweakControls {...base} otherClipCount={0} onApplyToAll={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Use this style/ })).not.toBeInTheDocument();
  });
});
