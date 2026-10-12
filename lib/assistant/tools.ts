import { SchemaType, type FunctionDeclaration } from "@google/generative-ai";
import { bestOnline, BLOCK_LABELS, CAPTION_MAX, DAYS_SHORT, POST_HASHTAGS_MAX, type AssistantCard } from "@clipiro/shared";
import { getUserTier } from "@/lib/auth";
import { buildAudience } from "@/lib/mobile/social";
import { prisma } from "@/lib/prisma";
import { resignMediaUrl } from "@/lib/signed-media";
import { loadAccounts } from "@/lib/social/queries";

// The tools Clipiro AI can call (mobile Phase 13, decision A4 A). Every one
// reads only the caller's own data, and none spends money: create_clips only
// proposes a run, which starts when the person taps Start on the AutoClip
// screen and pays there. A tool's `result` goes back to the model; its `card`
// goes to the app.

export interface ToolContext {
  userId: string;
  /** The phone's time zone, for "best time" and dates. */
  tz: string;
  now: Date;
}

export interface ToolOutcome {
  result: Record<string, unknown>;
  card?: AssistantCard;
}

interface Tool {
  declaration: FunctionDeclaration;
  /** Shown while it runs ("Looking at your projects…"). */
  status: string;
  run: (ctx: ToolContext, args: Record<string, unknown>) => Promise<ToolOutcome>;
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};
const PROVIDERS = ["youtube", "instagram", "facebook"] as const;
type PostProvider = (typeof PROVIDERS)[number];
const providerOf = (v: unknown): PostProvider => (PROVIDERS as readonly string[]).includes(v as string) ? (v as PostProvider) : "youtube";

/** A clip's words as plain text (its transcriptJson is word timings). */
function transcriptText(json: unknown, maxWords: number): string {
  if (!Array.isArray(json)) return "";
  return json
    .slice(0, maxWords)
    .map((w) => (w && typeof w === "object" && "word" in w ? String((w as { word: unknown }).word) : ""))
    .filter(Boolean)
    .join(" ");
}

/** The next time it's `day` (0 = Monday) at `hour` in the time zone, as an ISO string. */
export function nextAt(day: number, hour: number, tz: string, now: Date): string {
  const local = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const offsetMs = local.getTime() - now.getTime();
  const target = new Date(local);
  const dow = (local.getDay() + 6) % 7;
  target.setDate(local.getDate() + ((day - dow + 7) % 7));
  target.setHours(hour, 0, 0, 0);
  if (target.getTime() <= local.getTime() + 15 * 60_000) target.setDate(target.getDate() + 7);
  return new Date(target.getTime() - offsetMs).toISOString();
}

/** When people generally watch, for an account with no audience data yet. */
const GENERAL_BEST: Record<PostProvider, { day: number; hour: number }> = {
  youtube: { day: 4, hour: 18 }, // Friday evening
  instagram: { day: 2, hour: 19 }, // Wednesday evening
  facebook: { day: 3, hour: 13 }, // Thursday lunchtime
};

export const TOOLS: Record<string, Tool> = {
  list_projects: {
    status: "Looking at your projects…",
    declaration: {
      name: "list_projects",
      description: "List the person's projects (AutoClip runs and edits), newest first. Use it to find the project they mean, e.g. 'my Ep. 42 podcast'.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: { query: { type: SchemaType.STRING, description: "Words from the project's title, if they named one." } },
      },
    },
    run: async (ctx, args) => {
      const query = str(args.query, 80);
      const projects = await prisma.project.findMany({
        where: { userId: ctx.userId, ...(query ? { title: { contains: query, mode: "insensitive" } } : {}) },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, title: true, status: true, productType: true, createdAt: true, _count: { select: { clips: { where: { status: "ready" } } } } },
      });
      return {
        result: {
          projects: projects.map((p) => ({ id: p.id, title: p.title, kind: p.productType === "editor" ? "edit" : "autoclip", status: p.status, readyClips: p._count.clips, created: p.createdAt.toISOString().slice(0, 10) })),
        },
      };
    },
  },

  find_hooks: {
    status: "Finding the strongest hooks…",
    declaration: {
      name: "find_hooks",
      description: "The strongest clips of one AutoClip project by virality score, with each clip's opening words. Shows them to the person as a card.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          projectId: { type: SchemaType.STRING, description: "From list_projects." },
          count: { type: SchemaType.INTEGER, description: "How many clips, 1 to 6. Default 4." },
        },
        required: ["projectId"],
      },
    },
    run: async (ctx, args) => {
      const project = await prisma.project.findFirst({ where: { id: str(args.projectId, 64), userId: ctx.userId }, select: { id: true, title: true } });
      if (!project) return { result: { error: "No such project for this person." } };
      const clips = await prisma.clip.findMany({
        where: { projectId: project.id, status: "ready" },
        orderBy: [{ score: { sort: "desc", nulls: "last" } }, { index: "asc" }],
        take: int(args.count, 1, 6, 4),
        select: { id: true, index: true, title: true, score: true, durationSec: true, thumbnailUrl: true, transcriptJson: true, scoreBreakdown: true },
      });
      if (!clips.length) return { result: { project: project.title, clips: [], note: "This project has no finished clips yet." } };
      const card: AssistantCard = {
        type: "hooks",
        projectId: project.id,
        projectTitle: project.title,
        clips: await Promise.all(
          clips.map(async (c) => ({ id: c.id, title: c.title || `Clip ${c.index + 1}`, score: c.score, durationSec: c.durationSec, thumbnailUrl: await resignMediaUrl(c.thumbnailUrl) })),
        ),
      };
      return {
        card,
        result: {
          project: project.title,
          clips: clips.map((c) => ({
            id: c.id,
            title: c.title || `Clip ${c.index + 1}`,
            score: c.score,
            seconds: Math.round(c.durationSec),
            hookScore: (c.scoreBreakdown as { hook?: number } | null)?.hook ?? null,
            opensWith: transcriptText(c.transcriptJson, 18),
          })),
        },
      };
    },
  },

  get_clip: {
    status: "Reading the clip…",
    declaration: {
      name: "get_clip",
      description: "One clip's title, length and what is said in it. Read it before writing a caption for the clip.",
      parameters: { type: SchemaType.OBJECT, properties: { clipId: { type: SchemaType.STRING } }, required: ["clipId"] },
    },
    run: async (ctx, args) => {
      const clip = await prisma.clip.findFirst({
        where: { id: str(args.clipId, 64), project: { userId: ctx.userId } },
        select: { id: true, index: true, title: true, durationSec: true, transcriptJson: true, project: { select: { title: true } } },
      });
      if (!clip) return { result: { error: "No such clip for this person." } };
      return { result: { id: clip.id, title: clip.title || `Clip ${clip.index + 1}`, project: clip.project.title, seconds: Math.round(clip.durationSec), transcript: transcriptText(clip.transcriptJson, 160) } };
    },
  },

  show_caption: {
    status: "Writing the caption…",
    declaration: {
      name: "show_caption",
      description: "Show a caption you wrote as a card the person can copy or post. Write the caption yourself first (read the clip with get_clip).",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          clipId: { type: SchemaType.STRING, description: "The clip it's for, if any." },
          caption: { type: SchemaType.STRING, description: "The caption text, without hashtags." },
          hashtags: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Up to 8 hashtags." },
        },
        required: ["caption"],
      },
    },
    run: async (ctx, args) => {
      const caption = str(args.caption, CAPTION_MAX);
      if (!caption) return { result: { error: "The caption was empty." } };
      let clipId: string | null = str(args.clipId, 64) || null;
      if (clipId && !(await prisma.clip.findFirst({ where: { id: clipId, project: { userId: ctx.userId } }, select: { id: true } }))) clipId = null;
      // One tag per item: "#Founder Life" becomes #founderlife, not two tags.
      const tags = (Array.isArray(args.hashtags) ? args.hashtags : []).map((t) => `#${String(t).replace(/[^\p{L}\p{N}_]/gu, "").toLowerCase()}`);
      const hashtags = [...new Set(tags)].filter((t) => /^#[\p{L}\p{N}_]{1,60}$/u.test(t)).slice(0, Math.min(8, POST_HASHTAGS_MAX));
      return { card: { type: "caption", clipId, caption, hashtags }, result: { shown: true } };
    },
  },

  suggest_posting_time: {
    status: "Checking when your audience is online…",
    declaration: {
      name: "suggest_posting_time",
      description: "The best time to post on a platform: from the person's own audience when their account is connected and has data, otherwise general guidance. Shows it as a card.",
      parameters: { type: SchemaType.OBJECT, properties: { platform: { type: SchemaType.STRING, format: "enum", enum: [...PROVIDERS] } } },
    },
    run: async (ctx, args) => {
      const provider = providerOf(args.platform);
      const paid = (await getUserTier(ctx.userId)) !== "free";
      const account = paid ? (await loadAccounts(ctx.userId)).find((a) => a.provider === provider && a.status === "active") : undefined;
      if (account) {
        const audience = await buildAudience(account, ctx.tz).catch(() => null);
        if (audience && audience.online.some((row) => row.some((v) => v > 0))) {
          const best = bestOnline(audience.online);
          const hour = best.block * 4 + 2;
          const label = `${DAYS_SHORT[best.day]} around ${BLOCK_LABELS[best.block]}`;
          return { card: { type: "best_time", provider, at: nextAt(best.day, hour, ctx.tz, ctx.now), label, source: "audience" }, result: { from: "the person's own audience", best: label } };
        }
      }
      const g = GENERAL_BEST[provider];
      const label = `${DAYS_SHORT[g.day]} around ${g.hour > 12 ? `${g.hour - 12} PM` : `${g.hour} PM`}`;
      return {
        card: { type: "best_time", provider, at: nextAt(g.day, g.hour, ctx.tz, ctx.now), label, source: "general" },
        result: { from: account ? "general guidance (not enough audience data yet)" : "general guidance (no connected account with data)", best: label },
      };
    },
  },

  create_clips: {
    status: "Finding the video…",
    declaration: {
      name: "create_clips",
      description:
        "Set up an AutoClip run on a long video from the person's Assets. This does NOT start it: it shows a card, and the run starts (and uses Clip Minutes) only if the person taps Start on the AutoClip screen.",
      parameters: { type: SchemaType.OBJECT, properties: { query: { type: SchemaType.STRING, description: "Words from the video's file name, if they named one." } } },
    },
    run: async (ctx, args) => {
      const query = str(args.query, 80);
      const videos = await prisma.asset.findMany({
        where: { userId: ctx.userId, kind: "video", status: "ready", archivedAt: null, ...(query ? { name: { contains: query, mode: "insensitive" } } : {}) },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { id: true, name: true, duration: true, thumbnailS3Key: true },
      });
      const v = videos[0];
      if (!v) return { result: { error: query ? `No video in Assets matches "${query}".` : "There are no videos in Assets yet. They can upload one on the AutoClip screen." } };
      const minutes = v.duration ? Math.max(1, Math.ceil(v.duration / 60)) : 0;
      return {
        card: { type: "autoclip", assetId: v.id, name: v.name, durationSec: v.duration, estimatedMinutes: minutes },
        result: { video: v.name, minutes, otherMatches: videos.slice(1).map((x) => x.name), note: "Not started. The person starts it from the card." },
      };
    },
  },
};

export const TOOL_DECLARATIONS: FunctionDeclaration[] = Object.values(TOOLS).map((t) => t.declaration);
