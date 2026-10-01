/// <reference types="node" />
// Node APIs are used only by tests (to read the route tree from disk).
import fs from "node:fs";
import path from "node:path";
import { SCREEN_IDS, SCREENS, TAB_ROOTS } from "../screens";

const APP = path.join(__dirname, "../../app");

describe("screen registry", () => {
  it("covers exactly the 50 screens in design/SCREENS.md", () => {
    expect(SCREEN_IDS).toHaveLength(50);
  });

  it("serves every screen from its own route file", () => {
    for (const id of SCREEN_IDS) {
      const file = path.join(APP, SCREENS[id].file);
      expect({ id, exists: fs.existsSync(file) }).toEqual({ id, exists: true });
      // The file must render this screen, not a copy-pasted neighbour.
      expect({ id, renders: fs.readFileSync(file, "utf8").includes(`id="${id}"`) }).toEqual({ id, renders: true });
    }
  });

  it("gives every screen a unique URL", () => {
    const hrefs = SCREEN_IDS.map((id) => SCREENS[id].href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("only links to screens that exist, and every non-root screen has a way back", () => {
    for (const id of SCREEN_IDS) {
      for (const l of SCREENS[id].links) expect(SCREEN_IDS).toContain(l.to);
      const root = TAB_ROOTS.includes(id) || id === "Main" || id === "E-Welcome";
      if (!root) expect({ id, back: SCREENS[id].back }).toEqual({ id, back: expect.any(String) });
    }
  });

  it("has no orphan screens: every screen except Splash is linked from somewhere", () => {
    const linked = new Set(SCREEN_IDS.flatMap((id) => SCREENS[id].links.map((l) => l.to)));
    const orphans = SCREEN_IDS.filter((id) => id !== "Main" && !TAB_ROOTS.includes(id) && !linked.has(id));
    expect(orphans).toEqual([]);
  });
});