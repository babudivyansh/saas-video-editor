import type { Page } from "playwright";

/**
 * Per-tool instructions for capturing the two marketing screenshots that the
 * public /tools/<slug> pages render.
 *
 * One recipe per slug in ALL_TOOLS. `slug` must match, because the capture
 * script writes files named after it and app/tools/content.test.ts asserts
 * every tool has both shots on disk.
 *
 * Nothing here talks to a real provider: `mocks` intercepts each tool's own
 * endpoint with canned data, so a capture run costs no credits, makes no
 * external calls, and produces the same image every time.
 */
export interface ShotMock {
  /** Glob passed to page.route(), e.g. "**\/api/tools/voiceover". */
  url: string;
  body: unknown;
  status?: number;
  contentType?: string;
}

export interface ToolShotRecipe {
  slug: string;
  /** The tool's in-app path — must match its `href` in featureLinks.ts. */
  appPath: string;
  mocks?: ShotMock[];
  /**
   * localStorage entries written before first paint. Several tools keep their
   * output history client-side, which is a far simpler seam to populate than
   * mocking an async job endpoint and its polling loop. Values are
   * JSON-stringified for you. `{userId}` in a key is replaced with the capture
   * user's id.
   */
  seedStorage?: Record<string, unknown>;
  shots: {
    name: "ready" | "result";
    /** Drive the UI into the state worth photographing. */
    prepare?: (page: Page) => Promise<void>;
    /** Crop to a region instead of the full viewport. */
    clip?: { x: number; y: number; width: number; height: number };
  }[];
}

/** Settle time after an interaction, so transitions finish before the shutter. */
const SETTLE = 700;

export const RECIPES: ToolShotRecipe[] = [
  {
    slug: "ai-voiceover",
    appPath: "/dashboard/tools/voiceover",
    mocks: [
      // The voice list is component-side; this endpoint only supplies preview
      // URLs and legitimately returns {} when no ElevenLabs key is set.
      { url: "**/api/tools/voices", body: {} },
      {
        url: "**/api/tools/voiceover",
        body: {
          audioUrl: "/demo-voiceover.mp3",
          title: "Podcast intro",
          durationSec: 12.4,
          creditsUsed: 1,
        },
      },
    ],
    // Generation runs through the async job queue (POST returns a jobId, then
    // the client polls). Seeding the history the finished job would have
    // written is the same end state with none of the polling to mock.
    seedStorage: {
      "voiceover_history:{userId}": [
        {
          id: "capture-1",
          title: "Podcast intro — episode 42",
          voiceSlug: "william",
          audioUrl: "/demo-voiceover.mp3",
          durationMs: 12400,
          characters: 137,
          createdAt: 1_770_000_000_000,
        },
        {
          id: "capture-2",
          title: "Hook rewrite — v3",
          voiceSlug: "william",
          audioUrl: "/demo-voiceover.mp3",
          durationMs: 8100,
          characters: 92,
          createdAt: 1_769_900_000_000,
        },
      ],
    },
    shots: [
      { name: "ready" },
      {
        name: "result",
        prepare: async (page) => {
          const script = page.getByPlaceholder("Enter text here");
          await script.fill(
            "Most people quit right before the breakthrough. Here is the one habit that changed everything for me — and it takes ninety seconds a day.",
          );
          await page.getByPlaceholder("Enter a title for your voiceover").fill("Podcast intro — episode 42");
          await page.waitForTimeout(SETTLE);
        },
      },
    ],
  },

  {
    slug: "ai-brainstormer",
    appPath: "/dashboard/tools/brainstormer",
    mocks: [
      {
        url: "**/api/tools/brainstormer",
        body: {
          // Five, not four — the UI shows a "only N ideas came back" warning
          // banner for a short set, which would look like a defect in a shot.
          ideas: [
            { title: "The 90-second morning reset", description: "A tight before/after built around one habit, cut to a trending audio bed." },
            { title: "Three tools I wish I had at zero subscribers", description: "Listicle format — fast cuts, big captions, one takeaway per beat." },
            { title: "I posted daily for 30 days. Here is the honest data.", description: "Screen-recorded analytics as proof, narrated over B-roll." },
            { title: "Why your first three seconds lose the viewer", description: "Teardown format: show a weak hook, then rewrite it live." },
            { title: "Steal my exact posting schedule", description: "One card per slot, held long enough to screenshot — built for saves." },
          ],
        },
      },
    ],
    shots: [
      { name: "ready" },
      {
        name: "result",
        prepare: async (page) => {
          await page
            .getByPlaceholder("Generate ideas for a niche to start a page on")
            .fill("Short-form video tips for new creators");
          await page.getByRole("button", { name: /generate ideas/i }).click();
          await page.getByText("The 90-second morning reset").waitFor({ timeout: 15_000 });
          await page.waitForTimeout(SETTLE);
        },
      },
    ],
  },

  {
    slug: "ai-image-generator",
    appPath: "/dashboard/tools/image-generator",
    mocks: [
      {
        url: "**/api/tools/image-generator",
        body: {
          images: [{ url: "/hero/preview.jpg", width: 1024, height: 1024 }],
          creditsUsed: 2,
        },
      },
      { url: "**/api/tools/enhance-prompt", body: { prompt: "A neon-lit Tokyo alley at night, rain-slicked pavement reflecting signage, shallow depth of field, cinematic" } },
    ],
    // Same reasoning as the voiceover recipe: the gallery reads from
    // localStorage, so seeding it beats mocking the generation round-trip.
    //
    // The images are the existing /hero thumbnails, and each seeded prompt
    // describes what that file actually shows. Pairing a "neon Tokyo alley"
    // caption with a photo of a desk would be a dishonest screenshot, and the
    // caption is legible at capture resolution.
    seedStorage: {
      "image_gen_history:{userId}": [
        { id: "g1", imageUrl: "/hero/thumb-1.jpg", prompt: "Home studio corner with a ring light, tripod and open laptop", model: "Flux 2", ratio: "16:9", createdAt: 1_770_000_000_000 },
        { id: "g2", imageUrl: "/hero/thumb-2.jpg", prompt: "Desk setup lit warm at night, monitor glow on the wall", model: "Seedream 5.0", ratio: "16:9", createdAt: 1_769_990_000_000 },
        { id: "g3", imageUrl: "/hero/thumb-3.jpg", prompt: "Recording booth wall, acoustic panel and microphone arm", model: "Ideogram 4", ratio: "1:1", createdAt: 1_769_980_000_000 },
        { id: "g4", imageUrl: "/hero/thumb-4.jpg", prompt: "Creator workspace, camera on tripod facing the desk", model: "Flux 2", ratio: "16:9", createdAt: 1_769_970_000_000 },
        { id: "g5", imageUrl: "/hero/preview.jpg", prompt: "Wide shot of a filming setup mid-session", model: "GPT Image 2", ratio: "16:9", createdAt: 1_769_960_000_000 },
      ],
    },
    shots: [
      { name: "ready" },
      {
        name: "result",
        prepare: async (page) => {
          // Deliberately no thumbnail click — that opens a full-screen
          // lightbox over a dimmed page, which photographs badly.
          const prompt = page.locator("textarea").first();
          await prompt.fill("A home studio corner with a ring light, tripod and open laptop, warm evening light");
          await page.waitForTimeout(SETTLE);
        },
      },
    ],
  },

  {
    slug: "mp3-converter",
    appPath: "/dashboard/tools/free/mp3-converter",
    shots: [
      { name: "ready" },
      // Conversion runs locally through FFmpeg on a real file the capture has
      // no way to supply, so the second shot documents the drop zone in its
      // active state rather than faking a finished conversion.
      {
        name: "result",
        prepare: async (page) => {
          await page.waitForTimeout(SETTLE);
        },
      },
    ],
  },
];

export function recipeFor(slug: string): ToolShotRecipe | undefined {
  return RECIPES.find((r) => r.slug === slug);
}
