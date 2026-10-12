import { File, Paths } from "expo-file-system";
import { Album, Asset, requestPermissionsAsync } from "expo-media-library";
import * as Sharing from "expo-sharing";
import { projects } from "@/lib/api";

// A clip's MP4 on the phone: fetched from its signed link
// (GET /clips/:id/download) into the cache, then saved to the gallery
// (a "Clipiro" album) or handed to Android's share sheet.

const ALBUM = "Clipiro";

/** The gallery permission was refused; `message` says how to fix it. */
export class GalleryDenied extends Error {
  constructor() {
    super("Clipiro can’t save to your gallery. Allow it under Photos and videos in Android settings.");
  }
}

/** Downloads a video from a signed link into the app cache; returns the local file uri. */
export async function fetchVideoFile(url: string, name: string): Promise<string> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete(); // signed links change; the video may have been re-rendered
  const saved = await File.downloadFileAsync(url, file);
  return saved.uri;
}

/** Downloads one clip into the app cache; returns the local file uri. */
export async function fetchClipFile(clipId: string): Promise<string> {
  const link = await projects.downloadLink(clipId);
  return fetchVideoFile(link.url, `clip-${clipId}.mp4`);
}

/** Saves downloaded videos (local uris) into the gallery's "Clipiro" album, then drops the cached copies. */
async function addToGallery(next: () => Promise<string>, count: number, onEach?: (done: number) => void): Promise<void> {
  const { status } = await requestPermissionsAsync(true, ["video"]);
  if (status !== "granted") throw new GalleryDenied();
  let album = await Album.get(ALBUM).catch(() => null);
  for (let i = 0; i < count; i++) {
    const uri = await next();
    const asset = await Asset.create(uri);
    if (album) await album.add(asset).catch(() => {});
    else album = await Album.create(ALBUM, [asset], true).catch(() => null);
    new File(uri).delete(); // the gallery has its own copy now
    onEach?.(i + 1);
  }
}

/** Saves a video from a signed link (an editor export) to the gallery. */
export async function saveVideoToGallery(url: string, name: string): Promise<void> {
  await addToGallery(() => fetchVideoFile(url, name), 1);
}

/** Opens Android's share sheet with a video from a signed link. */
export async function shareVideo(url: string, name: string, title: string): Promise<void> {
  await Sharing.shareAsync(await fetchVideoFile(url, name), { mimeType: "video/mp4", dialogTitle: title });
}

/** Saves clips to the gallery, one at a time; `onEach` reports how many are done. */
export async function saveClipsToGallery(clipIds: string[], onEach?: (done: number) => void): Promise<void> {
  let i = 0;
  await addToGallery(() => fetchClipFile(clipIds[i++]!), clipIds.length, onEach);
}

/** Opens Android's share sheet with the clip's MP4 (WhatsApp, Instagram, Drive…). */
export async function shareClip(clipId: string, title: string): Promise<void> {
  const uri = await fetchClipFile(clipId);
  await Sharing.shareAsync(uri, { mimeType: "video/mp4", dialogTitle: title });
}
