import type { Prisma } from "@prisma/client";
import { isEditedClip, transcriptExcerpt } from "@/lib/clip-view";
import { resignMediaUrl } from "@/lib/signed-media";

// One clip as the clips view (a project's page or a collection's) reads it.
// GET /api/projects/[id]/clips and GET /api/clip-collections/[id]/clips both
// build rows from this, so a clip looks the same wherever it's listed.

export function clipViewSelect(wantExcerpts: boolean) {
  return {
    id: true, projectId: true, index: true, title: true, startSec: true, endSec: true, durationSec: true,
    aspectRatio: true, score: true, scoreBreakdown: true, mood: true, status: true, progress: true,
    videoUrl: true, thumbnailUrl: true, hasCaptions: true, captionStyleIndex: true, brollQuery: true,
    // Small settings blobs the drawer needs to show the clip's CURRENT style
    // and camera options rather than silently falling back to defaults.
    subtitleStyleOverride: true, silenceSettings: true, rerenderCount: true,
    // Lite-editor state and the waveform the scrubber draws. Peaks are ~300
    // small numbers per clip — an order of magnitude smaller than the
    // transcript, which stays behind the ?clipId= detail fetch.
    liteEdits: true, audioPeaks: true,
    // Why a clip failed. Selected nowhere, so the grid could only say "Failed
    // to render" while the reason sat on the row.
    failureReason: true,
    // The clips view's heart / thumbs-down and its Dubbed filter.
    isFavorite: true, isDisliked: true,
    dubs: { where: { status: "ready" }, select: { id: true }, take: 1 },
    // A collection mixes projects, so each clip names the one it came from.
    project: { select: { title: true } },
    // The list view shows the start of each clip's transcript. Opt-in, because
    // building it reads every clip's word timings, which the poll otherwise skips.
    transcriptJson: wantExcerpts,
  } satisfies Prisma.ClipSelect;
}

type ClipViewRow = Prisma.ClipGetPayload<{ select: ReturnType<typeof clipViewSelect> }>;

export async function toClipView(row: ClipViewRow, wantExcerpts: boolean) {
  const { dubs, transcriptJson, project, ...c } = row;
  return {
    ...c,
    // Renders are stored unsigned and the bucket is private.
    videoUrl: await resignMediaUrl(c.videoUrl),
    thumbnailUrl: await resignMediaUrl(c.thumbnailUrl),
    projectTitle: project.title,
    dubbed: dubs.length > 0,
    edited: isEditedClip(c),
    ...(wantExcerpts ? { transcriptExcerpt: transcriptExcerpt(transcriptJson) } : {}),
  };
}
