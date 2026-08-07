import { describe, expect, it } from "vitest";
import { stripPrismaDebugNamespaces } from "./prisma-debug-guard";

describe("stripPrismaDebugNamespaces", () => {
  it("returns undefined for empty / unset values", () => {
    expect(stripPrismaDebugNamespaces(undefined)).toBeUndefined();
    expect(stripPrismaDebugNamespaces("")).toBeUndefined();
  });

  it("strips the catch-all wildcard", () => {
    expect(stripPrismaDebugNamespaces("*")).toBeUndefined();
  });

  it("strips every prisma namespace variant", () => {
    expect(stripPrismaDebugNamespaces("prisma")).toBeUndefined();
    expect(stripPrismaDebugNamespaces("prisma:*")).toBeUndefined();
    expect(
      stripPrismaDebugNamespaces("prisma:client,prisma:client:clientEngine,prisma:driver-adapter:pg"),
    ).toBeUndefined();
  });

  it("keeps unrelated namespaces untouched", () => {
    expect(stripPrismaDebugNamespaces("myapp:*")).toBe("myapp:*");
    expect(stripPrismaDebugNamespaces("myapp:*,ioredis")).toBe("myapp:*,ioredis");
  });

  it("removes only the prisma entries from a mixed list", () => {
    expect(stripPrismaDebugNamespaces("myapp:*,prisma:*,ioredis")).toBe("myapp:*,ioredis");
    expect(stripPrismaDebugNamespaces("*,myapp:*")).toBe("myapp:*");
  });

  it("trims surrounding whitespace and drops empty entries", () => {
    expect(stripPrismaDebugNamespaces(" prisma:* , myapp:* ")).toBe("myapp:*");
    expect(stripPrismaDebugNamespaces("myapp:*,,prisma")).toBe("myapp:*");
  });

  it("does not strip lookalikes that merely start with 'prisma'", () => {
    expect(stripPrismaDebugNamespaces("prismaish")).toBe("prismaish");
    expect(stripPrismaDebugNamespaces("prisma-tools:*")).toBe("prisma-tools:*");
  });

  it("preserves negations that disable prisma logging", () => {
    expect(stripPrismaDebugNamespaces("myapp:*,-prisma:*")).toBe("myapp:*,-prisma:*");
  });
});
