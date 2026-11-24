// Client-safe budget constants (lib/campaigns/budget.ts imports prisma).
export const DEFAULT_DAILY_CAP = 100;
export const MAX_DAILY_CAP = 100_000;
/** Share of the providers' combined daily allowance kept back for non-campaign mail. */
export const RESERVE_SHARE = 0.4;
/** Most sends one cron run attempts, so a run finishes well inside its timeout. */
export const BATCH_PER_RUN = 60;
