import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "./logger";

afterEach(() => vi.restoreAllMocks());

const logged = () => {
  const line = (console.error as unknown as { mock: { calls: string[][] } }).mock.calls[0][0];
  return JSON.parse(line.slice(line.indexOf("{")));
};

describe("logger.error", () => {
  it("includes the cause, so a bare 'fetch failed' says why", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:3000"), { code: "ECONNREFUSED" });
    logger.error("t", "boom", new TypeError("fetch failed", { cause }));
    expect(logged()).toMatchObject({
      message: "fetch failed",
      cause: { message: "connect ECONNREFUSED 127.0.0.1:3000", code: "ECONNREFUSED" },
    });
  });

  it("omits cause when there is none", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("t", "boom", new Error("plain"));
    expect(logged()).not.toHaveProperty("cause");
  });
});
