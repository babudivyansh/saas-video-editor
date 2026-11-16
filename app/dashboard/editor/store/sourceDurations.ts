// Length of each source media file (assetId → seconds), learnt from the
// preview's <video>/<audio> elements and from the probe when an asset is added.
// The timeline doc doesn't store it, but trimming needs it: a clip can't be
// stretched past the end of the footage it plays.

const durations = new Map<string, number>();

export function recordSourceDuration(assetId: string, seconds: number): void {
  if (Number.isFinite(seconds) && seconds > 0) durations.set(assetId, seconds);
}

export function sourceDuration(assetId: string): number | undefined {
  return durations.get(assetId);
}
