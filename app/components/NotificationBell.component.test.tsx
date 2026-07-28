// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationBell } from "./NotificationBell";

vi.mock("./AuthContext", () => ({
  useAuth: () => ({ token: "test-token" }),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/unread-count")) {
          return { ok: true, json: async () => ({ unreadCount: 2 }) } as Response;
        }
        if (url.includes("/api/notifications")) {
          return {
            ok: true,
            json: async () => ({
              items: [
                { id: "n1", type: "review_published", title: "Your review is live!", body: null, href: "/reviews/rev-1", readAt: null, createdAt: new Date().toISOString() },
              ],
              unreadCount: 2,
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      }),
    );
  });

  it("shows the unread badge from a poll", async () => {
    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
  });

  it("loads and displays the notification list on open, then marks-read and navigates on click", async () => {
    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    await waitFor(() => expect(screen.getByText("Your review is live!")).toBeInTheDocument());

    await userEvent.click(screen.getByText("Your review is live!"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/reviews/rev-1"));
    expect(fetch).toHaveBeenCalledWith("/api/notifications/n1/read", expect.objectContaining({ method: "POST" }));
  });
});
