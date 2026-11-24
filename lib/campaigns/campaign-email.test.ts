import { describe, expect, it } from "vitest";
import { campaignBlockSchema, campaignContentSchema, utmSlug } from "./content";
import { campaign, toEmailBlocks, withUtm } from "@/lib/email/templates/campaign";
import { renderEmail } from "@/lib/email/layout";
import {
  AUDIENCE_ACTIVE, AUDIENCE_JOINED, AUDIENCE_JOURNEYS, campaignAudienceSchema, describeAudience,
} from "./audience-schema";

describe("campaign content schema", () => {
  it("accepts every block kind the editor can add", () => {
    const ok = campaignContentSchema.safeParse({
      subject: "Sale",
      preheader: "Now on",
      blocks: [
        { kind: "heading", text: "Hi" },
        { kind: "paragraph", text: "Body" },
        { kind: "button", label: "Go", href: "/pricing" },
        { kind: "image", src: "https://clipiro.com/x.png", alt: "x" },
        { kind: "offer", label: "Pro", price: "₹499", was: "₹999" },
        { kind: "coupon", code: "BF26" },
        { kind: "callout", tone: "brand", body: "Ends Sunday" },
        { kind: "list", items: ["a"] },
        { kind: "divider" },
        { kind: "spacer" },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it("refuses script links and non-https images", () => {
    expect(campaignBlockSchema.safeParse({ kind: "button", label: "x", href: "javascript:alert(1)" }).success).toBe(false);
    expect(campaignBlockSchema.safeParse({ kind: "image", src: "http://x.com/a.png", alt: "a" }).success).toBe(false);
    expect(campaignBlockSchema.safeParse({ kind: "image", src: "data:image/png;base64,xx", alt: "a" }).success).toBe(false);
  });

  it("refuses unknown block kinds and extra fields", () => {
    expect(campaignBlockSchema.safeParse({ kind: "html", html: "<b>x</b>" }).success).toBe(false);
    expect(campaignBlockSchema.safeParse({ kind: "heading", text: "x", html: "<b>" }).success).toBe(false);
  });
});

describe("utmSlug", () => {
  it("makes a tag-safe slug", () => {
    expect(utmSlug("Black Friday 2026!")).toBe("black-friday-2026");
    expect(utmSlug("   ")).toBe("campaign");
  });
});

describe("withUtm", () => {
  it("tags our own links, absolute and relative", () => {
    const a = new URL(withUtm("https://clipiro.com/pricing", "bf"));
    expect(a.searchParams.get("utm_campaign")).toBe("bf");
    expect(a.searchParams.get("utm_medium")).toBe("campaign");
    const r = new URL(withUtm("/pricing?x=1", "bf"));
    expect(r.hostname).toBe("clipiro.com");
    expect(r.searchParams.get("x")).toBe("1");
    expect(r.searchParams.get("utm_source")).toBe("email");
  });

  it("leaves other sites and existing tags alone", () => {
    expect(withUtm("https://youtube.com/watch?v=1", "bf")).toBe("https://youtube.com/watch?v=1");
    expect(withUtm("https://clipiro.com/?utm_campaign=keep", "bf")).toBe("https://clipiro.com/?utm_campaign=keep");
  });
});

describe("campaign email", () => {
  it("personalises {{name}}, splits paragraphs and keeps line breaks", () => {
    const blocks = toEmailBlocks(
      [{ kind: "heading", text: "Hi {{name}}" }, { kind: "paragraph", text: "one\ntwo\n\nthree" }],
      "Ana",
      "bf",
    );
    expect(blocks[0]).toMatchObject({ kind: "heading", text: "Hi Ana", level: 1 });
    expect(blocks).toHaveLength(3);
    expect(String((blocks[1] as { text: unknown }).text)).toBe("one<br/>two");
  });

  it("falls back to 'there' with no name", () => {
    const doc = campaign({ name: "", subject: "Hey {{name}}", preheader: "p", blocks: [{ kind: "divider" }], utmCampaign: "x" });
    expect(doc.subject).toBe("Hey there");
  });

  it("renders the offer, coupon and image, escaping what the admin typed", () => {
    const doc = campaign({
      name: "<b>Ana</b>",
      subject: "s",
      preheader: "p",
      utmCampaign: "bf",
      blocks: [
        { kind: "offer", label: "Pro", price: "₹499", was: "₹999" },
        { kind: "coupon", code: "BF<26>" },
        { kind: "image", src: "https://clipiro.com/a.png", alt: "Sale", href: "/pricing" },
        { kind: "paragraph", text: "Hi {{name}}" },
      ],
    });
    const { html, text } = renderEmail({ ...doc, accent: "brand", unsubscribeUrl: "https://clipiro.com/u" });
    expect(html).toContain("<s>₹999</s>");
    expect(html).toContain("BF&lt;26&gt;");
    expect(html).not.toContain("<b>Ana</b>");
    expect(html).toContain("utm_campaign=bf");
    expect(text).toContain("Use code: BF<26>");
    expect(text).toContain("₹499 (was ₹999)");
  });
});

describe("audience schema", () => {
  it("mirrors the Accounts page filter values", async () => {
    // user-filters imports prisma via staff-digest; read its constants from source instead.
    const fs = await import("fs");
    const src = fs.readFileSync("lib/admin/user-filters.ts", "utf8");
    const list = (name: string) => {
      const m = new RegExp(`${name} = \\[([^\\]]*)\\]`).exec(src);
      return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
    };
    expect([...AUDIENCE_JOURNEYS]).toEqual(list("JOURNEY_FILTERS"));
    expect([...AUDIENCE_ACTIVE]).toEqual(list("ACTIVE_FILTERS"));
    const joined = /JOINED_FILTERS = \{([^}]*)\}/.exec(src)?.[1] ?? "";
    expect([...AUDIENCE_JOINED]).toEqual([...joined.matchAll(/"([^"]+)"/g)].map((x) => x[1]));
  });

  it("defaults to everyone and describes itself", () => {
    const a = campaignAudienceSchema.parse({});
    expect(a.plan).toBe("all");
    expect(describeAudience({ plan: "free", journey: "free_after_run" })).toBe("Free users · Ran AutoClip, never paid");
    expect(describeAudience({ plan: "all", billing: "trial_cancelled" })).toBe("Everyone · Trial cancelled");
  });
});
