// Zero-dependency: safe to import from "use client" pages (dashboard/referral,
// admin/affiliate) as well as server routes/lib without pulling in prisma or
// email side effects.
export const MIN_PAYOUT_AMOUNT = 500; // ₹500, INR
