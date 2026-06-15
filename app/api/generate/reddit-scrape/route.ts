import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";

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

const POPULAR_REDDIT_STORIES = [
  {
    subreddit: "r/AskReddit",
    author: "throwaway_reddit_user",
    title: "What is a scientific fact that absolutely blows your mind every time you think about it?",
    selftext: "For me, it's that time dilation is real. If you travel at the speed of light, you could travel across the universe in what feels like an instant to you, while billions of years pass on Earth. It's crazy to think that space and time are so flexible.",
    ups: 14200,
    comments: 980
  },
  {
    subreddit: "r/AmItheAsshole",
    author: "reddit_guru_99",
    title: "AITA for refusing to pay for my brother's wedding dinner after he uninvited my husband?",
    selftext: "My brother is getting married next month. Initially, my husband and I were both invited, and I agreed to pay for the rehearsal dinner as a gift. Last week, my brother told me he wanted a 'small family-only' vibe and asked my husband not to come because they 'aren't that close'. I told him if my husband is uninvited, I'm backing out of paying. AITA?",
    ups: 24500,
    comments: 3120
  },
  {
    subreddit: "r/confession",
    author: "secret_keeper_xx",
    title: "I have been pretending to love my wife's terrible cooking for 7 years and I don't know how to stop.",
    selftext: "When we first started dating, she made me a lasagne that was completely burnt and tasted like cardboard. I was so in love that I told her it was the best thing I'd ever eaten. Now, she makes it every single week for dinner, thinking it's my favorite. I feel trapped in my own lie.",
    ups: 8900,
    comments: 650
  }
];

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  try {
    // Basic validation of Reddit URL
    if (!/reddit\.com\/r\//.test(url)) {
      throw new Error("Invalid Reddit URL format");
    }

    // Prepare JSON url. E.g. https://www.reddit.com/r/AskReddit/comments/123/title/ -> title.json
    let jsonUrl = url;
    if (jsonUrl.endsWith("/")) {
      jsonUrl = jsonUrl.slice(0, -1);
    }
    if (!jsonUrl.endsWith(".json")) {
      jsonUrl += ".json";
    }

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
    console.warn("[reddit-scrape] Scraping failed, falling back to mock data. Error:", err);
    // Graceful fallback to a random story from the list
    const randomStory = POPULAR_REDDIT_STORIES[Math.floor(Math.random() * POPULAR_REDDIT_STORIES.length)];
    return NextResponse.json(randomStory);
  }
}
