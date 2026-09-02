export type AssetKind = "video" | "audio" | "image";
export type ModerationStatus = "pending" | "clean" | "flagged" | "skipped" | "not_configured";
export type AssetStatus = "processing" | "ready" | "failed";

export interface AssetTagRef {
  id: string;
  name: string;
}

export interface AssetFolderRef {
  id: string;
  name: string;
  color: string | null;
}

export interface Asset {
  id: string;
  name: string;
  url: string;
  thumbnailUrl: string | null;
  mimeType: string;
  kind: AssetKind;
  size: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  isFavorite: boolean;
  archivedAt: string | null;
  moderationStatus: ModerationStatus;
  /**
   * processing | ready | failed — orthogonal to moderationStatus. The library
   * never declared this, so an asset stuck mid-processing or outright failed
   * rendered as a perfectly normal, usable card.
   */
  status: AssetStatus;
  /** Which feature funneled this into the library. */
  sourceFeature: string;
  sourceProjectId: string | null;
  sourceClipId: string | null;
  folder: AssetFolderRef | null;
  tags: AssetTagRef[];
  createdAt: string;
  updatedAt: string;
}

export interface AssetFolder {
  id: string;
  name: string;
  color: string | null;
  assetCount: number;
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
  assetCount: number;
}

export interface AssetStats {
  totalSize: number;
  count: number;
  byKind: { video: number; audio: number; image: number };
  usedBytes: number;
  limitBytes: number;
  /** Per-file upload cap for the account's current tier (distinct from limitBytes, the cumulative quota). */
  maxUploadBytes: number;
  tier: string;
}

export type KindFilter = "all" | AssetKind;
export type SortOption = "date" | "oldest" | "name" | "size" | "duration";

export interface AssetListFilters {
  kind: KindFilter;
  sort: SortOption;
  q: string;
  folderId?: string; // "none" = unfiled, a real id = that folder
  tag?: string;
  favorite?: boolean;
  archived?: boolean;
}
