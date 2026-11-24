// Client-safe shape of a campaign's delivery report (lib/campaigns/delivery.ts
// computes it; that module imports prisma).

export type DeliveryBucket = "delivered" | "bounced" | "complained" | "failed" | "pending" | "untracked";

export interface CampaignDelivery {
  /** Emails a provider took (or queued) for this campaign. */
  handedOff: number;
  delivered: number;
  bounced: number;
  complained: number;
  /** Refused after hand-off (provider error, suppressed at retry). */
  failed: number;
  /** Taken by a provider, no delivery report yet. */
  pending: number;
  /** No delivery record at all (e.g. local dev with no provider). */
  untracked: number;
}
