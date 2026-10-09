import type { AppNotification } from "@clipiro/shared";
import { prisma } from "@/lib/prisma";
import { resignMediaUrl } from "@/lib/signed-media";
import { appUrl } from "@/lib/social/oauth";

// The web's notifications (lib/notify.ts), for the app: each one's web link
// becomes the app screen that shows the same thing, where there is one, and
// a "clips are ready" notification carries its project's first thumbnail.

export interface WebNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | Date | null;
  createdAt: string | Date;
}

const iso = (d: string | Date) => (typeof d === "string" ? d : d.toISOString());

/** The app route for a web link, or null when the app has no such screen. */
export function appHref(href: string | null): string | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href, "https://clipiro.com");
  } catch {
    return null;
  }
  if (url.hostname !== "clipiro.com" && url.hostname !== new URL(appUrl()).hostname) return null;
  const p = url.pathname.replace(/\/$/, "");
  const q = url.searchParams;
  if (p === "/dashboard/create/auto-clip") return q.get("project") ? `/projects/${encodeURIComponent(q.get("project")!)}` : "/create/autoclip";
  if (p === "/dashboard/editor" && q.get("projectId")) return `/editor/export?projectId=${encodeURIComponent(q.get("projectId")!)}`;
  if (p.startsWith("/dashboard/social-tracker")) return "/social/insights";
  if (p === "/dashboard" && q.get("billing")) return q.get("tab") === "topup" ? "/you/credits" : "/you/subscription";
  if (p === "/dashboard/tools/voiceover") return "/create/ai-media?tab=voiceover";
  if (p === "/dashboard/tools/image-generator") return "/create/ai-media";
  if (p === "/dashboard/create/auto-clip" || p === "/dashboard") return "/home";
  return null; // reviews, admin pages and the rest live on the web only
}

/** The web link as an absolute clipiro.com URL. */
function webUrl(href: string | null): string | null {
  if (!href) return null;
  try {
    return new URL(href, appUrl()).toString();
  } catch {
    return null;
  }
}

const projectOf = (href: string | null) => {
  try {
    return href ? new URL(href, "https://clipiro.com").searchParams.get("project") : null;
  } catch {
    return null;
  }
};

export async function toMobileNotifications(userId: string, items: WebNotification[]): Promise<AppNotification[]> {
  // One query for every project these notifications point at, scoped to the caller.
  const projectIds = [...new Set(items.filter((n) => n.type.startsWith("autoclip_")).map((n) => projectOf(n.href)).filter((x): x is string => !!x))];
  const thumbs = new Map<string, string | null>();
  if (projectIds.length) {
    const clips = await prisma.clip.findMany({
      where: { projectId: { in: projectIds }, project: { userId }, thumbnailUrl: { not: null } },
      orderBy: { index: "asc" },
      distinct: ["projectId"],
      select: { projectId: true, thumbnailUrl: true },
    });
    await Promise.all(clips.map(async (c) => thumbs.set(c.projectId, await resignMediaUrl(c.thumbnailUrl))));
  }
  return items.map((n) => {
    const project = projectOf(n.href);
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      href: appHref(n.href),
      webUrl: webUrl(n.href),
      thumbnailUrl: (project && thumbs.get(project)) ?? null,
      readAt: n.readAt ? iso(n.readAt) : null,
      createdAt: iso(n.createdAt),
    };
  });
}
