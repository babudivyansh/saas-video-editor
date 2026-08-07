import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// The script is plain CommonJS and guards its side effects behind
// `require.main === module`, so importing it only pulls the pure helpers.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { listFiles, verifyComplete, copyAndVerify } = require("./postbuild.js");

const tmpDirs: string[] = [];
function mkTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "postbuild-test-"));
  tmpDirs.push(dir);
  return dir;
}
function write(root: string, rel: string, content: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("postbuild static-copy verification", () => {
  it("listFiles walks nested dirs and reports byte sizes", () => {
    const src = mkTmp();
    write(src, "a.js", "hello");
    write(src, "chunks/b.js", "worldwide");
    const files = listFiles(src).sort((a: { rel: string }, b: { rel: string }) => a.rel.localeCompare(b.rel));
    expect(files).toEqual([
      { rel: "a.js", size: 5 },
      { rel: path.join("chunks", "b.js"), size: 9 },
    ]);
  });

  it("copyAndVerify copies a full tree and passes verification", () => {
    const src = mkTmp();
    const dest = mkTmp();
    write(src, "chunks/turbopack-runtime.js", "RUNTIME");
    write(src, "chunks/page.js", "PAGE");
    write(src, "media/font.woff2", "FONT");
    expect(() => copyAndVerify(src, dest, "test")).not.toThrow();
    expect(fs.readFileSync(path.join(dest, "chunks/turbopack-runtime.js"), "utf8")).toBe("RUNTIME");
    expect(fs.existsSync(path.join(dest, "media/font.woff2"))).toBe(true);
  });

  it("verifyComplete throws when a source file is missing at the destination", () => {
    const src = mkTmp();
    const dest = mkTmp();
    write(src, "chunks/turbopack-runtime.js", "RUNTIME");
    write(src, "chunks/page.js", "PAGE");
    // Simulate a partial copy: everything except the runtime chunk landed.
    write(dest, "chunks/page.js", "PAGE");
    expect(() => verifyComplete(src, dest, "test")).toThrow(/incomplete/i);
  });

  it("verifyComplete throws when a copied file is truncated", () => {
    const src = mkTmp();
    const dest = mkTmp();
    write(src, "chunks/big.js", "FULL-CONTENT");
    write(dest, "chunks/big.js", "FULL"); // shorter => size mismatch
    expect(() => verifyComplete(src, dest, "test")).toThrow(/incomplete/i);
  });

  it("verifyComplete tolerates extra files already present at the destination", () => {
    const src = mkTmp();
    const dest = mkTmp();
    write(src, "chunks/page.js", "PAGE");
    write(dest, "chunks/page.js", "PAGE");
    write(dest, "chunks/stale-old-chunk.js", "STALE"); // extra file, not in source
    expect(() => verifyComplete(src, dest, "test")).not.toThrow();
  });
});
