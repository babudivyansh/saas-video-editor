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

/** Downloads one clip into the app cache; returns the local file uri. */
export async function fetchClipFile(clipId: string): Promise<string> {
  const link = await projects.downloadLink(clipId);
  const file = new File(Paths.cache, `clip-${clipId}.mp4`);
  if (file.exists) file.delete(); // signed links change; the clip may have been re-rendered
  const saved = await File.downloadFileAsync(link.url, file);
  return saved.uri;
}

/** Saves clips to the gallery, one at a time; `onEach` reports how many are done. */
export async function saveClipsToGallery(clipIds: string[], onEach?: (done: number) => void): Promise<void> {
  const { status } = await requestPermissionsAsync(true, ["video"]);
  if (status !== "granted") throw new GalleryDenied();
  let album = await Album.get(ALBUM).catch(() => null);
  for (let i = 0; i < clipIds.length; i++) {
    const uri = await fetchClipFile(clipIds[i]!);
    const asset = await Asset.create(uri);
    if (album) await album.add(asset).catch(() => {});
    else album = await Album.create(ALBUM, [asset], true).catch(() => null);
    new File(uri).delete(); // the gallery has its own copy now
    onEach?.(i + 1);
  }
}

/** Opens Android's share sheet with the clip's MP4 (WhatsApp, Instagram, Drive…). */
export async function shareClip(clipId: string, title: string): Promise<void> {
  const uri = await fetchClipFile(clipId);
  await Sharing.shareAsync(uri, { mimeType: "video/mp4", dialogTitle: title });
}
