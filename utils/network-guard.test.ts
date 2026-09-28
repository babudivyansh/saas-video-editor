// @vitest-environment node
import { describe, expect, it } from "vitest";
import os from "os";
import path from "path";
import { isPrivateAddress, isPrivateHostLiteral } from "./network-guard";
import { downloadFile } from "./download";

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1",
    "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254",
  ])("blocks %s", (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each(["8.8.8.8", "52.95.110.1", "172.32.0.1", "2600:1f18::1"])("allows %s", (ip) =>
    expect(isPrivateAddress(ip)).toBe(false));
});

describe("downloadFile network guard", () => {
  const dest = () => path.join(os.tmpdir(), `guard-${Math.random().toString(36).slice(2)}.bin`);

  it("refuses cloud metadata and localhost literals before any request", async () => {
    expect(isPrivateHostLiteral("[::1]")).toBe(true);
    await expect(downloadFile("http://169.254.169.254/latest/meta-data/", dest(), 1000)).rejects.toThrow(/not a public address/);
    await expect(downloadFile("http://127.0.0.1:3000/", dest(), 1000)).rejects.toThrow(/not a public address/);
    await expect(downloadFile("http://[::1]/", dest(), 1000)).rejects.toThrow(/not a public address/);
  });

  it("refuses a hostname that resolves to a private address", async () => {
    await expect(downloadFile("http://localhost:9/", dest(), 1000)).rejects.toThrow(/non-public address/);
  });

  it("refuses non-http protocols", async () => {
    await expect(downloadFile("file:///etc/passwd", dest(), 1000)).rejects.toThrow(/unsupported protocol/);
  });
});
