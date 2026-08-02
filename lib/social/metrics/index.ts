// Barrel for the pure metrics engine.
//
// Everything under lib/social/metrics is side-effect free: no prisma, no redis,
// no fetch, no clock access. Callers pass rows and an explicit `now`, and get
// derived numbers back. That is what makes the same formulas safe to run in a
// route handler, a cron job, a PDF builder, an AI factsheet, and a unit test.

export * from "./types";
export * from "./dates";
export * from "./series";
export * from "./posts";
export * from "./timing";
export * from "./alerts";
export * from "./compare";
export * from "./account";
