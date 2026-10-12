import { describe, expect, it } from "vitest";
import {
  AI_TEXT_OPERATIONS,
  CAPTION_HIGHLIGHTS,
  CAPTION_POSITIONS,
  EDITOR_ASPECTS,
  EDITOR_EFFECTS,
  EDITOR_EXPORT_CREDITS,
  EDITOR_FILTERS,
  EDITOR_FONTS,
  EDITOR_TRANSITIONS,
  TEXT_ANIMATIONS,
  TEXT_PRESETS,
  TEXT_STYLES,
} from "@clipiro/shared";
import { ADD_TEXT_PRESETS, TEXT_TEMPLATES } from "../app/dashboard/editor/components/panels/text/textPresets";
import { AI_TEXT_FREE_OPERATIONS, AI_TEXT_LLM_OPERATIONS } from "./editor/ai-text";
import {
  ASPECT_DIMENSIONS,
  CAPTION_HIGHLIGHT_MODES,
  CAPTION_POSITION_PRESETS,
  EFFECT_PRESETS,
  FILTER_PRESETS,
  FONT_WHITELIST,
  TEXT_ENTRANCE_PRESETS,
  TRANSITION_PRESETS,
} from "./editor/types";
import { TOOL_COSTS } from "./tool-costs";

// The phone's editor offers exactly the web editor's options. If the web adds,
// renames or removes one, this fails until @clipiro/shared is updated.

const options = (presets: Record<string, { label: string }>) => Object.entries(presets).map(([id, p]) => ({ id, label: p.label }));

describe("mobile editor catalogue matches the web editor", () => {
  it("aspects and fonts", () => {
    expect([...EDITOR_ASPECTS]).toEqual(Object.keys(ASPECT_DIMENSIONS));
    expect([...EDITOR_FONTS]).toEqual([...FONT_WHITELIST]);
  });

  it("filters, effects, transitions and text animations", () => {
    expect(EDITOR_FILTERS).toEqual(options(FILTER_PRESETS));
    expect(EDITOR_EFFECTS).toEqual(options(EFFECT_PRESETS));
    expect(EDITOR_TRANSITIONS).toEqual(options(TRANSITION_PRESETS));
    expect(TEXT_ANIMATIONS).toEqual(options(TEXT_ENTRANCE_PRESETS));
  });

  it("text presets and styles", () => {
    expect(TEXT_PRESETS.map((p) => p.label)).toEqual(ADD_TEXT_PRESETS.map((p) => p.label));
    expect([...TEXT_STYLES]).toEqual(TEXT_TEMPLATES.map((t) => t.label));
  });

  it("caption highlight modes and positions (the app leaves out 'custom' drag positioning)", () => {
    expect(CAPTION_HIGHLIGHTS).toEqual(options(CAPTION_HIGHLIGHT_MODES));
    expect(CAPTION_POSITIONS).toEqual(options(CAPTION_POSITION_PRESETS).filter((p) => p.id !== "custom"));
  });

  it("AI text operations and the export price", () => {
    expect(AI_TEXT_OPERATIONS.filter((o) => !o.instant).map((o) => o.id)).toEqual([...AI_TEXT_LLM_OPERATIONS]);
    expect(AI_TEXT_OPERATIONS.filter((o) => o.instant).map((o) => o.id)).toEqual([...AI_TEXT_FREE_OPERATIONS]);
    expect(EDITOR_EXPORT_CREDITS).toBe(TOOL_COSTS["editor-render"].creditCost);
  });
});
