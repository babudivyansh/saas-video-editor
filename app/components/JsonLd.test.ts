import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { serializeJsonLd } from "./JsonLd";

describe("serializeJsonLd", () => {
  it("cannot be broken out of by a </script> in user-written text", () => {
    const out = serializeJsonLd({ reviewBody: "</script><script>alert(1)</script>" });
    expect(out).not.toMatch(/<\/script/i);
    expect(out).not.toContain("<");
  });

  it("round-trips to the same data", () => {
    const data = { name: "a < b", nested: ["<!--", "</SCRIPT>"] };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });
});
