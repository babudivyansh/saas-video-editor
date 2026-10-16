import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

// readUploadForm's size check only protects memory if Next has not already
// buffered the body for proxy.ts — which it does for every path the proxy's
// matcher covers. So every route that reads an upload through readUploadForm /
// readMultipartWithin must be excluded from that matcher, and every exclusion
// must still point at a real route. The matcher is compiled with Next's own
// getMiddlewareMatchers, so this tests what Next actually runs. proxy.ts is
// read as text: importing it pulls in env/redis.

const root = path.resolve(__dirname, "..");
const toolsDir = path.join(root, "app", "api", "tools");

const proxySource = fs.readFileSync(path.join(root, "proxy.ts"), "utf8");
const matcher = /matcher:\s*\[\s*"([^"]+)"/.exec(proxySource)?.[1] ?? "";

const nodeRequire = createRequire(path.join(root, "package.json"));
const { getMiddlewareMatchers } = nodeRequire("next/dist/build/analysis/get-page-static-info.js") as {
  getMiddlewareMatchers: (m: string, cfg: Record<string, unknown>) => { regexp: string }[];
};
const matcherRe = new RegExp(getMiddlewareMatchers(matcher, {})[0].regexp);
const runsProxy = (p: string) => matcherRe.test(p);

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
    expect(runsProxy(`/api/tools/${slug}`)).toBe(false);
  });

  it("keeps the Asset Library upload out, but only that exact path", () => {
    expect(fs.readFileSync(path.join(root, "app", "api", "upload", "route.ts"), "utf8")).toContain("readMultipartWithin(");
    expect(runsProxy("/api/upload")).toBe(false);
    for (const p of ["/api/upload-policy", "/api/upload/multipart/start", "/api/uploads"]) expect(runsProxy(p), p).toBe(true);
  });

  it("still runs the proxy on everything else", () => {
    for (const p of ["/dashboard", "/api/tools/voiceover", "/api/tools/image-generator", "/api/tools/youtube-downloader", "/"]) {
      expect(runsProxy(p), p).toBe(true);
    }
  });

  it("every excluded tool path is a route that calls readUploadForm", () => {
    const excluded = [...matcher.matchAll(/api\/tools\/([a-z0-9-]+)/g)].map((m) => m[1]);
    expect(excluded.sort()).toEqual([...uploadRoutes].sort());
  });
});
