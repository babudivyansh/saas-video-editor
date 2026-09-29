// Shape of GET /api/admin/ops, shared by the Operations tabs.

export interface CronRunStatus {
  name: string;
  lastRunAt: string | null;
  ageSeconds: number | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  failing: boolean;
}

export interface CronJobRow {
  path: string;
  runId: string;
  label: string;
  description: string;
  tier: "safe" | "danger";
  confirmPhrase: string | null;
  schedule: string;
  scheduleText: string;
  nextDueAt: string | null;
  secretEnv: string;
  secretConfigured: boolean;
  paused: { by: string; at: string; reason?: string } | null;
  lastManual: { by: string; at: string } | null;
  status: CronRunStatus | null;
}

export type JobState = "waiting" | "active" | "delayed" | "failed" | "completed";

export interface QueueSummary {
  name: string;
  driver: "bullmq" | "in-process";
  started: boolean;
  paused: boolean;
  counts: Record<JobState, number>;
}

export interface QueueJob {
  id: string;
  state: JobState;
  projectId: string | null;
  attempts: number;
  error: string | null;
  stack: string | null;
  at: number | null;
  data: string;
}

export interface OpsData {
  /** Null when BullMQ's Redis is unreachable. */
  queues: QueueSummary[] | null;
  failedJobs: Array<QueueJob & { queueName: string }>;
  heartbeats: Record<string, string | null>;
  cronRuns: CronRunStatus[];
  cronJobs: CronJobRow[];
  health: { db: boolean; redis: boolean };
  queueDriver: "bullmq" | "in-process";
  /** Last call to /api/cron-tick (the external per-minute scheduler). */
  cronTickLastAt?: string | null;
  cronTickAgeSeconds?: number | null;
  flags: Record<string, boolean>;
  maintenance: { on: boolean; message?: string };
  tableSizes: Array<{ table: string; size: string }>;
}

export interface AssetsAdminData {
  totalBytes: number;
  totalAssets: number;
  archivedBytes: number;
  archivedCount: number;
  orphanedPendingUploads: number;
  topUsers: Array<{ userId: string; email: string; name: string | null; bytes: number; count: number }>;
  flaggedAssets: Array<{ id: string; name: string; kind: string; size: number; createdAt: string; user: { email: string } | null }>;
}

export type Headers = () => Record<string, string>;

/** Is a job in a state that needs attention? */
export function jobState(j: CronJobRow): "paused" | "failing" | "never" | "ok" {
  if (j.paused) return "paused";
  if (j.status?.failing) return "failing";
  if (!j.status?.lastRunAt) return "never";
  return "ok";
}

export function fmtBytes(bytes: number) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export async function postJson(url: string, headers: Headers, body: unknown): Promise<unknown> {
  const res = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string; issues?: Array<{ message: string }> }).issues?.[0]?.message ?? (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data;
}
