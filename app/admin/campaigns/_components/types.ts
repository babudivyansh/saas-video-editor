import type { CampaignBlock, CampaignBlockKind } from "@/lib/campaigns/content";
import type { CampaignAudience } from "@/lib/campaigns/audience-schema";

export type { CampaignBlock, CampaignBlockKind, CampaignAudience };

export type CampaignStatus = "draft" | "scheduled" | "sending" | "paused" | "sent" | "cancelled";

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  preheader: string;
  blocks: CampaignBlock[];
  audience: CampaignAudience;
  audienceLabel: string;
  utmCampaign: string;
  status: CampaignStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  audienceCount: number | null;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignBudget {
  allowed: number;
  sentToday: number;
  dailyCap: number;
  providerSpare: number | null;
  reserve: number;
  blockedBy: "paused" | "daily_cap" | "quota" | null;
}

export interface CampaignDraft {
  name: string;
  subject: string;
  preheader: string;
  blocks: CampaignBlock[];
  audience: CampaignAudience;
}

export const STATUS_TONE: Record<CampaignStatus, "neutral" | "info" | "primary" | "warning" | "success" | "error"> = {
  draft: "neutral",
  scheduled: "info",
  sending: "primary",
  paused: "warning",
  sent: "success",
  cancelled: "error",
};

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  paused: "Paused",
  sent: "Sent",
  cancelled: "Cancelled",
};

export const BLOCK_LABEL: Record<CampaignBlockKind, string> = {
  heading: "Heading",
  paragraph: "Text",
  button: "Button",
  image: "Image",
  offer: "Offer / price",
  coupon: "Coupon code",
  callout: "Highlight box",
  list: "Checklist",
  divider: "Divider",
  spacer: "Space",
};

export function newBlock(kind: CampaignBlockKind): CampaignBlock {
  switch (kind) {
    case "heading": return { kind, text: "Big news, {{name}}" };
    case "paragraph": return { kind, text: "Write your message here." };
    case "button": return { kind, label: "See the offer", href: "/pricing" };
    case "image": return { kind, src: "", alt: "" };
    case "offer": return { kind, label: "This week only", price: "₹499", was: "₹999", caption: "" };
    case "coupon": return { kind, code: "SALE", caption: "" };
    case "callout": return { kind, tone: "brand", title: "", body: "Ends Sunday at midnight." };
    case "list": return { kind, items: ["First benefit", "Second benefit"] };
    case "divider": return { kind };
    case "spacer": return { kind };
  }
}

/** Starting points for a new campaign. */
export const STARTERS: Record<"sale" | "blank", { label: string; draft: CampaignDraft }> = {
  sale: {
    label: "Sale",
    draft: {
      name: "Black Friday 2026",
      subject: "Black Friday: 2x Clip Minutes is live",
      preheader: "Double minutes on every pack and on month one of any new plan. Ends 30 Nov.",
      audience: { plan: "all" },
      blocks: [
        { kind: "heading", text: "Hi {{name}}, Black Friday is live" },
        { kind: "paragraph", text: "For one week, every Clip Minutes pack comes with double the minutes.\n\nStart a new plan and your first month of minutes is doubled too." },
        { kind: "offer", label: "Every minute pack", price: "2x minutes", was: "", caption: "Ends 30 Nov, 11:59 PM IST" },
        { kind: "list", items: ["Double minutes on every pack", "Month one doubled on new plans", "No code needed, applied at checkout"] },
        { kind: "button", label: "Get 2x minutes", href: "/pricing" },
        { kind: "paragraph", text: "Questions? Just reply to this email." },
      ],
    },
  },
  blank: {
    label: "Blank",
    draft: {
      name: "",
      subject: "",
      preheader: "",
      audience: { plan: "all" },
      blocks: [{ kind: "heading", text: "Hi {{name}}" }, { kind: "paragraph", text: "" }],
    },
  },
};

export function fmtDateTime(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";
}
