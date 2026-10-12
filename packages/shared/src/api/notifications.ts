import { z } from "zod";
import { notificationSchema, notificationsPageSchema, registerDeviceRequest, unreadCountSchema, unregisterDeviceRequest } from "../schemas/account";
import type { ApiClient } from "./client";

const ok = z.object({ ok: z.literal(true) });

// /api/mobile/v1/notifications and /devices.
export function notificationsApi(api: ApiClient) {
  return {
    list: (cursor?: string | null) => api.request(`/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { schema: notificationsPageSchema }),
    unreadCount: () => api.request("/notifications/unread-count", { schema: unreadCountSchema }),
    markRead: (id: string) => api.request(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST", body: {}, schema: notificationSchema }),
    markAllRead: () => api.request("/notifications/read-all", { method: "POST", body: {}, schema: ok }),
    /** After sign-in, and whenever the push token changes. */
    registerDevice: (b: z.input<typeof registerDeviceRequest>) => api.request("/devices", { method: "POST", body: registerDeviceRequest.parse(b), schema: ok }),
    unregisterDevice: (b: z.input<typeof unregisterDeviceRequest>) => api.request("/devices", { method: "DELETE", body: unregisterDeviceRequest.parse(b), schema: ok }),
  };
}
