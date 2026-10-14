/** `renders/abc/clip-3.mp4` → `renders/abc/clip-3-copy-<suffix>.mp4` */
export function copyKeyFor(key: string, suffix: string): string {
  const slash = key.lastIndexOf("/");
  const dot = key.lastIndexOf(".");
  return dot > slash ? `${key.slice(0, dot)}-copy-${suffix}${key.slice(dot)}` : `${key}-copy-${suffix}`;
}
