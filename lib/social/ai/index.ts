// Barrel for the social AI layer.
//
// The shape every generator shares: `(facts: Factsheet, …) => Promise<T>`. None
// of them import prisma, so none of them can reach past the factsheet they were
// given — the assembly of that factsheet is the caller's job, and the only place
// a query can hide.

export * from "./schemas";
export * from "./factsheets";
export * from "./client";
export * from "./kpi-explain";
export * from "./executive-summary";
export * from "./content-recommendations";
export * from "./caption-hashtags";
export * from "./schedule-suggestions";
export * from "./growth-opportunities";
export * from "./post-narration";
