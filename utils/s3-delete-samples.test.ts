// Sample videos are one object shared by every user who picked them, so no
// per-user delete may reach them (lib/sample-projects.ts).

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    AWS_REGION: "ap-south-1",
    AWS_ACCESS_KEY_ID: "AKIATESTTESTTEST",
    AWS_SECRET_ACCESS_KEY: "secretsecretsecretsecretsecret",
    AWS_S3_BUCKET: "clipiro-test",
  },
}));

const { s3, deleteS3Object, deleteS3Prefix } = await import("./s3-upload");

describe("shared sample objects", () => {
  it("deleteS3Object skips sample keys and deletes others", async () => {
    const send = vi.spyOn(s3, "send").mockResolvedValue({} as never);
    await deleteS3Object("samples/podcast.mp4");
    expect(send).not.toHaveBeenCalled();
    await deleteS3Object("uploads/u1/a.mp4");
    expect(send).toHaveBeenCalledTimes(1);
    send.mockRestore();
  });

  it("deleteS3Prefix refuses the samples prefix", async () => {
    await expect(deleteS3Prefix("samples/x/")).rejects.toThrow(/refusing/);
  });
});
