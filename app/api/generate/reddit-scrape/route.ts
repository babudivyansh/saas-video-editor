import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { logger } from "@/lib/logger";

interface RedditPostJSON {
  kind: string;
  data: {
    children: {
      kind: string;
      data: {
        title: string;
        selftext: string;
        subreddit: string;
        author: string;
        ups: number;
        num_comments: number;
      };
    }[];
  };
}

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  try {
    // Validate against the actual host + path (not a substring match) so a URL
    // like https://internal-host/x?u=reddit.com/r/y can't sneak past validation
    // and get fetched server-side (SSRF).
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("Invalid Reddit URL format");
    }
    const host = parsed.hostname.toLowerCase();
    const isRedditHost = host === "reddit.com" || host === "www.reddit.com";
    if (parsed.protocol !== "https:" || !isRedditHost || !parsed.pathname.startsWith("/r/")) {
      throw new Error("Invalid Reddit URL format");
    }

    // Rebuild the JSON url from the validated host/path only — never from the
    // raw input string — so no other part of the original URL can carry through.
    let jsonUrl = `https://${host}${parsed.pathname}`;
    if (jsonUrl.endsWith("/")) {
      jsonUrl = jsonUrl.slice(0, -1);
    }
    jsonUrl += ".json";

    // Try fetching with custom user agent to avoid 429
    const response = await fetch(jsonUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch from Reddit (${response.status})`);
    }

    const data = await response.json() as [RedditPostJSON, unknown];
    if (!Array.isArray(data) || !data[0]?.data?.children?.[0]?.data) {
      throw new Error("Unexpected Reddit API response format");
    }

    const postData = data[0].data.children[0].data;

    return NextResponse.json({
      subreddit: `r/${postData.subreddit}`,
      author: postData.author,
      title: postData.title,
      selftext: postData.selftext || "",
      ups: postData.ups || 99,
      comments: postData.num_comments || 99
    });
  } catch (err) {
    logger.warn("reddit-scrape", "Scraping failed", err);
    return NextResponse.json(
      { error: "Could not fetch this Reddit post — Reddit may be blocking the request. Try a different post URL." },
      { status: 502 },
    );
  }
}

export const POST = withRateLimit(handlePOST, { limit: 20, windowSec: 60, keyBy: "user", name: "generate:reddit-scrape" });
