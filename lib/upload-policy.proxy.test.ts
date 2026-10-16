import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

// readUploadForm's size check only protects memory if Next has not already
// buffered the body for proxy.ts — which it does for every path the proxy's
// matcher covers. So every route that reads an upload through readUploadForm
// must be excluded from that matcher, and every exclusion must still point at
// a real route. Read statically: proxy.ts pulls in env/redis at import time.

const root = path.resolve(__dirname, "..");
const toolsDir = path.join(root, "app", "api", "tools");

const proxySource = fs.readFileSync(path.join(root, "proxy.ts"), "utf8");
const matcher = /matcher:\s*\[\s*"([^"]+)"/.exec(proxySource)?.[1] ?? "";
// Next turns the source into an anchored regex; this is the same shape.
const matcherRe = new RegExp(`^${matcher}$`);

const uploadRoutes = fs
  .readdirSync(toolsDir)
  .filter((dir) => {
    const file = path.join(toolsDir, dir, "route.ts");
    return fs.existsSync(file) && fs.readFileSync(file, "utf8").includes("readUploadForm(");
  });

describe("proxy matcher vs upload routes", () => {
  it("finds the matcher and the upload routes", () => {
    expect(matcher).not.toBe("");
    expect(uploadRoutes.length).toBeGreaterThanOrEqual(10);
  });

  it.each(uploadRoutes)("keeps /api/tools/%s out of the proxy", (slug) => {
    expect(matcherRe.test(`/api/tools/${slug}`)).toBe(false);
  });

  it("still runs the proxy on everything else", () => {
    for (const p of ["/dashboard", "/api/tools/voiceover", "/api/tools/image-generator", "/api/upload", "/"]) {
      expect(matcherRe.test(p), p).toBe(true);
    }
  });

  it("every excluded tool path is a route that calls readUploadForm", () => {
    const excluded = [...matcher.matchAll(/api\/tools\/([a-z0-9-]+)/g)].map((m) => m[1]);
    expect(excluded.sort()).toEqual([...uploadRoutes].sort());
  });
});
