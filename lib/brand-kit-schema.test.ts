import { describe, expect, it } from "vitest";
import { brandKitCreateSchema, brandKitPatchSchema } from "./brand-kit-schema";

describe("brand kit schemas", () => {
  it("accepts what the style panel saves", () => {
    const kit = {
      name: "Podcast", fontName: "Bebas Neue", fontSize: 80,
      baseColor: "&H00FFFFFF", highlightColor: "&H0000FFFF", outlineColor: "&H00000000", shadowColor: "&H00000000",
      outlineWidth: 8, shadowDepth: 0, borderStyle: 1, alignment: 5, animated: true,
    };
    expect(brandKitCreateSchema.safeParse(kit).success).toBe(true);
    expect(brandKitPatchSchema.safeParse({ baseColor: "&H00FF00FF" }).success).toBe(true);
  });

  // These strings are written into the ASS Style line: a newline starts a new
  // line of the subtitle file, a comma shifts every field after it.
  it.each([
    ["a colour with a newline", { baseColor: "&H00FFFFFF\nDialogue: 0,0:00:00.00,9:00:00.00,Default,,0,0,0,,owned" }],
    ["a colour with a comma", { highlightColor: "&H00FF,1" }],
    ["a non-ASS colour", { outlineColor: "#ffffff" }],
    ["a font name with a comma", { fontName: "Arial,1" }],
  ])("PATCH refuses %s", (_label, body) => {
    expect(brandKitPatchSchema.safeParse(body).success).toBe(false);
  });

  it("PATCH refuses unknown fields and an empty body", () => {
    expect(brandKitPatchSchema.safeParse({ userId: "someone-else" }).success).toBe(false);
    expect(brandKitPatchSchema.safeParse({}).success).toBe(false);
  });
});
