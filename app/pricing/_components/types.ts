import type { DisplayPlan } from "@/lib/plans/display";

/** The plan shape /api/plans returns — shared with the billing PlansModal. */
export type DbPlan = DisplayPlan;

/** One row of /api/tool-costs. */
export interface ToolCost {
  slug: string;
  label: string;
  service: string;
  creditCost: number;
  creditCostMin?: number;
  creditCostMax?: number;
}
