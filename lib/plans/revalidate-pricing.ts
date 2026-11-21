import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";

// /pricing is ISR-cached (app/pricing/page.tsx). Anything that changes what it
// shows (a plan row, its price, the USD price book) calls this so the next
// visit re-renders instead of waiting out the revalidate window.
//
// Never throws: the admin write has already been committed by the time this
// runs, and a failed cache refresh must not turn a successful save into a 500.
// The page's own revalidate timer is the fallback.
export function revalidatePricing(): void {
  try {
    revalidatePath("/pricing");
  } catch (e) {
    logger.warn("pricing", "revalidatePath(/pricing) failed — page refreshes on its timer", {
      reason: (e as Error).message,
    });
  }
}
