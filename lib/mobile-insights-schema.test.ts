import { describe, expect, it } from "vitest";
import { INSIGHT_METRICS, MAX_COMPETITORS, METRIC_SUPPORT, PROVIDERS, RANGE_DAYS, WEEKLY_SUMMARY_CREDITS, compact } from "@clipiro/shared";
import { capability } from "./social/capabilities";
import { MAX_COMPETITORS as WEB_MAX_COMPETITORS } from "./social/competitors";
import { rangeDaysSchema } from "./social/schemas";
import { TOOL_COSTS } from "./tool-costs";

// The phone's Insights rules match the web's Social Tracker; this fails when
// the web changes and @clipiro/shared doesn't.
describe("mobile Insights rules match the web", () => {
  it("periods", () => {
    for (const d of RANGE_DAYS) expect(rangeDaysSchema.safeParse(d).success).toBe(true);
    for (const d of [1, 28, 60, 120, 366]) expect(rangeDaysSchema.safeParse(d).success).toBe(false);
  });

  it("which platform can't report which metric, and why", () => {
    for (const p of PROVIDERS)
      for (const m of INSIGHT_METRICS) {
        const web = capability(p, m);
        const mobile = METRIC_SUPPORT[p][m];
        if (web.support === "unavailable") expect({ p, m, ...mobile }).toEqual({ p, m, support: "unavailable", reason: web.reason });
        else expect({ p, m, unavailable: mobile?.support === "unavailable" }).toEqual({ p, m, unavailable: false });
      }
  });

  it("competitor cap and weekly summary price", () => {
    expect(MAX_COMPETITORS).toBe(WEB_MAX_COMPETITORS);
    expect(WEEKLY_SUMMARY_CREDITS).toBe(TOOL_COSTS["social-exec-report"].creditCost);
  });

  it("compact numbers", () => {
    expect([compact(412_000), compact(26_100), compact(1_200), compact(980), compact(1_260_000)]).toEqual(["412k", "26.1k", "1.2k", "980", "1.3M"]);
  });
});

describe("mobile report options match the web", () => {
  it("sections, formats and schedules", async () => {
    const { reportConfigSchema, reportSectionSchema, reportFormatSchema } = await import("./social/schemas");
    const { REPORT_SECTIONS, REPORT_FORMATS, REPORT_SCHEDULES } = await import("@clipiro/shared");
    expect(REPORT_SECTIONS.map((s) => s.id)).toEqual(reportSectionSchema.options);
    expect([...REPORT_FORMATS]).toEqual(reportFormatSchema.options);
    expect([...REPORT_SCHEDULES]).toEqual(reportConfigSchema.shape.schedule.unwrap().options);
  });
});
