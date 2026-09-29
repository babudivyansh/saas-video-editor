import { AsyncLocalStorage } from "node:async_hooks";

// Who is making the current admin request, available to anything that runs
// inside it — chiefly auditAdminAction, so every audit row records the IP,
// device and session without each of its ~55 call sites passing them.
// withAdmin (lib/admin/api.ts) opens the scope.

export interface AdminRequestContext {
  adminId: string;
  adminEmail: string;
  sessionId: string;
  ip: string | null;
  userAgent: string | null;
}

const storage = new AsyncLocalStorage<AdminRequestContext>();

export function runWithAdminContext<T>(ctx: AdminRequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getAdminContext(): AdminRequestContext | undefined {
  return storage.getStore();
}
