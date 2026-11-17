// New post: pick a video, pick where, write the caption, pick when.
//
// One composer for the whole app. "+ New post" opens it empty; a clip's Post
// button opens it with ?clip= so the video is already chosen.

import { prisma } from "@/lib/prisma";
import { resignMediaUrl } from "@/lib/signed-media";
import { getAssetReadUrl } from "@/utils/s3-upload";
import { getToolConfig } from "@/lib/tool-config";
import { POSTABLE_PROVIDERS } from "@/lib/social/publish";
import { bestSlots, type BestSlot } from "@/lib/social/posts-web";
import { accountLabel, first, loadViewContext, type SearchParams } from "../shared";
import { Composer, type ComposerVideo } from "../components/Composer";

export const dynamic = "force-dynamic";

const RECENT = 60;

export default async function NewPostPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { userId, allAccounts, filters } = await loadViewContext(params);
  const clipId = first(params.clip);
  const assetId = first(params.asset);

  const clipSelect = {
    id: true, title: true, index: true, thumbnailUrl: true, durationSec: true, createdAt: true,
    project: { select: { title: true } },
  } as const;
  const [clips, picked, assets, captionCost] = await Promise.all([
    prisma.clip.findMany({
      where: { project: { userId }, status: "ready", videoUrl: { not: null } },
      orderBy: { createdAt: "desc" },
      take: RECENT,
      select: clipSelect,
    }),
    // A clip handed over from a project may be older than the recent list.
    clipId
      ? prisma.clip.findFirst({ where: { id: clipId, project: { userId }, status: "ready", videoUrl: { not: null } }, select: clipSelect })
      : Promise.resolve(null),
    prisma.asset.findMany({
      where: { userId, kind: "video", status: "ready", archivedAt: null },
      orderBy: { createdAt: "desc" },
      take: RECENT,
      select: { id: true, name: true, duration: true, thumbnailS3Key: true },
    }),
    getToolConfig("social-caption").then((c) => c.creditCost),
  ]);

  const allClips = picked && !clips.some((c) => c.id === picked.id) ? [picked, ...clips] : clips;
  const videos: ComposerVideo[] = [
    ...(await Promise.all(
      allClips.map(async (c) => ({
        kind: "clip" as const,
        id: c.id,
        title: c.title || `Clip ${c.index + 1}`,
        subtitle: c.project.title,
        durationSec: c.durationSec,
        thumbnailUrl: await resignMediaUrl(c.thumbnailUrl),
      })),
    )),
    ...(await Promise.all(
      assets.map(async (a) => ({
        kind: "asset" as const,
        id: a.id,
        title: a.name.replace(/\.[a-z0-9]{2,4}$/i, ""),
        subtitle: "Assets",
        durationSec: a.duration,
        thumbnailUrl: a.thumbnailS3Key ? await getAssetReadUrl(a.thumbnailS3Key).catch(() => null) : null,
      })),
    )),
  ];

  const postable = allAccounts.filter((a) => POSTABLE_PROVIDERS.has(a.provider));

  // Best times come from the account's own history; the first account with
  // enough posts in a slot answers for the composer.
  let slots: BestSlot[] = [];
  for (const account of postable) {
    const posts = await prisma.socialPost.findMany({
      where: { accountId: account.id, publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
      take: 200,
      select: { id: true, publishedAt: true, views: true, reach: true, likes: true, comments: true, shares: true, saves: true },
    });
    slots = bestSlots(posts, account.timezone ?? "UTC");
    if (slots.length > 0) break;
  }

  const preselectedAccount = filters.scope.kind === "one" ? filters.scope.id : null;
  const initial =
    picked ? { kind: "clip" as const, id: picked.id } : assetId && assets.some((a) => a.id === assetId) ? { kind: "asset" as const, id: assetId } : null;

  return (
    <Composer
      videos={videos}
      initialVideo={initial}
      accounts={postable.map((a) => ({
        id: a.id,
        provider: a.provider,
        label: accountLabel(a),
        active: a.status === "active",
      }))}
      initialAccountIds={
        preselectedAccount && postable.some((a) => a.id === preselectedAccount)
          ? [preselectedAccount]
          : postable.filter((a) => a.status === "active").slice(0, 1).map((a) => a.id)
      }
      bestSlots={slots}
      captionCost={captionCost}
    />
  );
}
