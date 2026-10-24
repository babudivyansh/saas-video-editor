// @vitest-environment jsdom
//
// A clip's Captions panel: the template picker and the three tweaks.
// testTimeout is raised because jsdom + userEvent tests have no headroom
// against vitest's 5s default once `npm test` runs many files in parallel.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CAPTION_FAMILIES, CAPTION_TEMPLATES } from "@clipiro/shared/caption-templates";
import { CaptionTemplatePicker, CaptionTweakControls } from "./CaptionTemplatePicker";
import { resetCaptionTemplateCache } from "@/app/components/captions/useCaptionTemplates";

vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  resetCaptionTemplateCache();
  const body = { tier: "pro", families: CAPTION_FAMILIES, templates: CAPTION_TEMPLATES.map((t) => ({ ...t, locked: false })) };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })));
});

afterEach(() => vi.unstubAllGlobals());

describe("CaptionTemplatePicker", () => {
  it("reports the chosen template id", async () => {
    const onChange = vi.fn();
    render(<CaptionTemplatePicker value="clean" onChange={onChange} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Two Mic$/ }));
    expect(onChange).toHaveBeenCalledWith("twomic");
  });

  it("applies the server's renames (admin overrides)", async () => {
    resetCaptionTemplateCache();
    const body = {
      tier: "pro",
      families: CAPTION_FAMILIES,
      templates: CAPTION_TEMPLATES.map((t) => ({ ...t, name: t.id === "clean" ? "Plain Jane" : t.name, locked: false })),
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })));
    render(<CaptionTemplatePicker value={null} onChange={() => {}} />);
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
    applyToAll: false,
    onApplyToAllChange: vi.fn(),
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

  it("states that apply-to-all does not render anything", () => {
    render(<CaptionTweakControls {...base} />);
    expect(screen.getByText(/without re-rendering them, so it costs nothing now/)).toBeInTheDocument();
  });
});
