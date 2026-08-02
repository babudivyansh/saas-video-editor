import { describe, it, expect } from "vitest";
import {
  MAX_SERIES_CELLS,
  accountIdsSchema,
  competitorSchema,
  contentQuerySchema,
  cronJobSchema,
  goalSchema,
  granularitySchema,
  handleSchema,
  metricKeysSchema,
  overviewQuerySchema,
  rangeDaysSchema,
  rangeSchema,
  reportConfigSchema,
  seriesQuerySchema,
  timezoneSchema,
  tzOffsetSchema,
} from "./schemas";

const ID = "clx1a2b3c4d5e6f7";

describe("accountIdsSchema", () => {
  it("splits a comma list and trims", () => {
    expect(accountIdsSchema.parse(` ${ID} , ${ID}2 `)).toEqual([ID, `${ID}2`]);
  });

  it("rejects an empty list", () => {
    expect(accountIdsSchema.safeParse("").success).toBe(false);
    expect(accountIdsSchema.safeParse(" , , ").success).toBe(false);
  });

  it("caps the fan-out at 10", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `${ID}${i}`).join(",");
    expect(accountIdsSchema.safeParse(eleven).success).toBe(false);
  });

  it("rejects ids with punctuation", () => {
    expect(accountIdsSchema.safeParse("../../etc/passwd").success).toBe(false);
    expect(accountIdsSchema.safeParse("abc'; DROP TABLE--").success).toBe(false);
  });
});

describe("rangeDaysSchema", () => {
  it("accepts the preset ranges, as numbers or strings", () => {
    for (const v of [7, 14, 30, 90, 180, 365]) expect(rangeDaysSchema.parse(v)).toBe(v);
    expect(rangeDaysSchema.parse("90")).toBe(90);
  });

  it("rejects anything else", () => {
    for (const v of [0, -30, 31, 1000, "abc"]) expect(rangeDaysSchema.safeParse(v).success).toBe(false);
  });
});

describe("rangeSchema", () => {
  it("accepts a preset", () => {
    expect(rangeSchema.parse({ range: 30 })).toEqual({ range: 30 });
  });

  it("accepts a custom window", () => {
    const v = { from: "2026-01-01", to: "2026-03-01" };
    expect(rangeSchema.parse(v)).toEqual(v);
  });

  it("rejects an inverted custom window", () => {
    expect(rangeSchema.safeParse({ from: "2026-03-01", to: "2026-01-01" }).success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(rangeSchema.safeParse({ from: "01/01/2026", to: "2026-03-01" }).success).toBe(false);
  });
});

describe("timezoneSchema", () => {
  it("accepts real IANA zones", () => {
    expect(timezoneSchema.parse("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(timezoneSchema.parse("UTC")).toBe("UTC");
  });

  it("rejects a typo instead of silently falling back to UTC", () => {
    expect(timezoneSchema.safeParse("Asia/Kolkatta").success).toBe(false);
    expect(timezoneSchema.safeParse("Mars/Olympus").success).toBe(false);
  });

  it("defaults to UTC when absent", () => {
    expect(timezoneSchema.parse(undefined)).toBe("UTC");
  });
});

describe("tzOffsetSchema", () => {
  it("rounds to a quarter hour so odd values cannot fragment the cache", () => {
    expect(tzOffsetSchema.parse(330)).toBe(330); // IST
    expect(tzOffsetSchema.parse(337)).toBe(330);
    expect(tzOffsetSchema.parse(-283)).toBe(-285);
  });

  it("clamps to the real range", () => {
    expect(tzOffsetSchema.parse(99999)).toBe(840);
    expect(tzOffsetSchema.parse(-99999)).toBe(-840);
  });

  it("treats junk as UTC rather than throwing", () => {
    expect(tzOffsetSchema.parse("nonsense")).toBe(0);
    expect(tzOffsetSchema.parse(undefined)).toBe(0);
  });
});

describe("metricKeysSchema", () => {
  it("accepts known metrics", () => {
    expect(metricKeysSchema.parse("followers,reach")).toEqual(["followers", "reach"]);
  });

  it("rejects an unknown metric — this is the hallucination guard", () => {
    expect(metricKeysSchema.safeParse("followers,vibes").success).toBe(false);
  });
});

describe("granularitySchema", () => {
  it("defaults to day", () => expect(granularitySchema.parse(undefined)).toBe("day"));
  it("rejects unknown values", () => expect(granularitySchema.safeParse("hour").success).toBe(false));
});

describe("handleSchema", () => {
  it("strips a leading @", () => {
    expect(handleSchema.parse("@creator.name")).toBe("creator.name");
  });

  it("trims", () => {
    expect(handleSchema.parse("  creator  ")).toBe("creator");
  });

  it("rejects handles with spaces, slashes or a URL", () => {
    for (const v of ["two words", "a/b", "https://instagram.com/x", "x"]) {
      expect(handleSchema.safeParse(v).success, v).toBe(false);
    }
  });

  it("rejects an over-long handle", () => {
    expect(handleSchema.safeParse("a".repeat(61)).success).toBe(false);
  });
});

describe("competitorSchema", () => {
  it("accepts the two supported providers", () => {
    expect(competitorSchema.parse({ provider: "instagram", handle: "@x.y" })).toEqual({
      provider: "instagram",
      handle: "x.y",
    });
  });

  it("rejects a provider we have no competitor source for", () => {
    expect(competitorSchema.safeParse({ provider: "facebook", handle: "abc" }).success).toBe(false);
  });
});

describe("seriesQuerySchema", () => {
  const base = { accountIds: ID, metrics: "followers", range: "30", granularity: "day", tz: "UTC" };

  it("parses a valid query", () => {
    const out = seriesQuerySchema.parse(base);
    expect(out.accountIds).toEqual([ID]);
    expect(out.metrics).toEqual(["followers"]);
    expect(out.compare).toBe("none");
  });

  it("enforces the accounts × metrics cap", () => {
    const accounts = Array.from({ length: 8 }, (_, i) => `${ID}${i}`).join(",");
    const metrics = "followers,reach,views,likes,comments,shares";
    const result = seriesQuerySchema.safeParse({ ...base, accountIds: accounts, metrics });
    expect(8 * 6).toBeGreaterThan(MAX_SERIES_CELLS);
    expect(result.success).toBe(false);
  });

  it("allows a request exactly at the cap", () => {
    const accounts = Array.from({ length: 8 }, (_, i) => `${ID}${i}`).join(",");
    const metrics = "followers,reach,views,likes,comments"; // 8 × 5 = 40
    expect(seriesQuerySchema.safeParse({ ...base, accountIds: accounts, metrics }).success).toBe(true);
  });
});

describe("overviewQuerySchema", () => {
  it("defaults range and tz", () => {
    const out = overviewQuerySchema.parse({});
    expect(out.range).toBe(30);
    expect(out.tz).toBe("UTC");
  });
});

describe("contentQuerySchema", () => {
  it("defaults sort and limit", () => {
    const out = contentQuerySchema.parse({ accountId: ID });
    expect(out.sort).toBe("publishedAt");
    expect(out.limit).toBe(25);
  });

  it("accepts the new score sorts", () => {
    expect(contentQuerySchema.parse({ accountId: ID, sort: "viralScore" }).sort).toBe("viralScore");
  });

  it("rejects an arbitrary sort field — no ordering by unindexed columns", () => {
    expect(contentQuerySchema.safeParse({ accountId: ID, sort: "caption" }).success).toBe(false);
  });

  it("caps limit", () => {
    expect(contentQuerySchema.safeParse({ accountId: ID, limit: 5000 }).success).toBe(false);
  });
});

describe("goalSchema", () => {
  const future = new Date(Date.now() + 30 * 86_400_000).toISOString();

  it("accepts a future goal", () => {
    const out = goalSchema.parse({ metric: "followers", target: 10_000, dueAt: future });
    expect(out.target).toBe(10_000);
  });

  it("rejects a goal due in the past", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(goalSchema.safeParse({ metric: "followers", target: 100, dueAt: past }).success).toBe(false);
  });

  it("rejects a non-positive target", () => {
    expect(goalSchema.safeParse({ metric: "followers", target: 0, dueAt: future }).success).toBe(false);
    expect(goalSchema.safeParse({ metric: "followers", target: -5, dueAt: future }).success).toBe(false);
  });

  it("rejects an unknown metric", () => {
    expect(goalSchema.safeParse({ metric: "clout", target: 5, dueAt: future }).success).toBe(false);
  });
});

describe("reportConfigSchema", () => {
  const valid = {
    name: "Monthly client report",
    accountIds: [ID],
    period: "monthly",
    sections: ["kpis", "trends"],
    format: "pdf",
  };

  it("accepts a valid config and applies defaults", () => {
    const out = reportConfigSchema.parse(valid);
    expect(out.schedule).toBe("none");
    expect(out.recipients).toEqual([]);
  });

  it("requires at least one section", () => {
    expect(reportConfigSchema.safeParse({ ...valid, sections: [] }).success).toBe(false);
  });

  it("validates recipient addresses", () => {
    expect(reportConfigSchema.safeParse({ ...valid, recipients: ["not-an-email"] }).success).toBe(false);
    expect(reportConfigSchema.safeParse({ ...valid, recipients: ["a@b.com"] }).success).toBe(true);
  });
});

describe("cronJobSchema", () => {
  it("defaults to refresh", () => expect(cronJobSchema.parse(undefined)).toBe("refresh"));
  it("accepts the new jobs", () => {
    for (const j of ["daily-metrics", "scores", "reports", "goals"]) {
      expect(cronJobSchema.parse(j)).toBe(j);
    }
  });
  it("rejects an unknown job", () => expect(cronJobSchema.safeParse("drop-tables").success).toBe(false));
});
