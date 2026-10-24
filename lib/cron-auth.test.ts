import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { cronSecretMatches } from "./cron-auth";

const req = (headers: Record<string, string>, url = "http://localhost/api/cron/x") => new NextRequest(url, { headers });

describe("cronSecretMatches", () => {
  it("accepts the right bearer secret", () => {
    expect(cronSecretMatches(req({ authorization: "Bearer s3cret" }), "s3cret")).toBe(true);
  });
  it("rejects a wrong or bare secret", () => {
    expect(cronSecretMatches(req({ authorization: "Bearer nope" }), "s3cret")).toBe(false);
    expect(cronSecretMatches(req({ authorization: "s3cret" }), "s3cret")).toBe(false);
    expect(cronSecretMatches(req({}), "s3cret")).toBe(false);
  });
  it("accepts the secret in X-Cron-Secret, for hosts that strip Authorization", () => {
    expect(cronSecretMatches(req({ "x-cron-secret": "s3cret" }), "s3cret")).toBe(true);
    expect(cronSecretMatches(req({ "x-cron-secret": "nope" }), "s3cret")).toBe(false);
    expect(cronSecretMatches(req({ "x-cron-secret": "" }), "s3cret")).toBe(false);
  });
  it("accepts the request when either header carries the secret", () => {
    expect(cronSecretMatches(req({ "x-cron-secret": "nope", authorization: "Bearer s3cret" }), "s3cret")).toBe(true);
    expect(cronSecretMatches(req({ "x-cron-secret": "s3cret", authorization: "Bearer nope" }), "s3cret")).toBe(true);
  });
  it("never matches an empty secret", () => {
    expect(cronSecretMatches(req({ "x-cron-secret": "" }), "")).toBe(false);
    expect(cronSecretMatches(req({ authorization: "Bearer " }), "")).toBe(false);
  });
  it("ignores a ?secret= query parameter", () => {
    expect(cronSecretMatches(req({}, "http://localhost/api/cron/x?secret=s3cret"), "s3cret")).toBe(false);
  });
});
